import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import Anthropic from '@anthropic-ai/sdk';
import { getAllUsers, isBirthdayOn } from './utils.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const BIRTHDAY_FIELD_ID = process.env.BIRTHDAY_FIELD_ID;
const CHANNEL = process.env.BIRTHDAY_CHANNEL || process.env.ANNIVERSARY_CHANNEL;

async function fetchRandomBirthdayGif() {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=happy+birthday&rating=g`
    );
    const { data } = await res.json();
    return data?.images?.original?.url ?? null;
  } catch {
    return null;
  }
}

function getAnniversaryYears(startDateValue) {
  const joined = new Date(startDateValue);
  const today = new Date();
  return today.getFullYear() - joined.getFullYear();
}

function isAnniversaryToday(startDateValue) {
  if (!startDateValue) return false;
  const joined = new Date(startDateValue);
  const today = new Date();
  const years = today.getFullYear() - joined.getFullYear();
  return (
    years >= 1 &&
    joined.getMonth() === today.getMonth() &&
    joined.getDate() === today.getDate()
  );
}

function pickBirthdayStyle() {
  const styles = [
    'Techy/IT-flavored — make a playful reference to coding, debugging, deployments, or coffee. Fun and nerdy.',
    'Sweet and heartfelt — warm, sincere, about how much the person means to the team. No tech references.',
    'Funny and playful — light humor, unexpected comparisons, something that makes people smile. Keep it work-appropriate.',
    'Hype and energetic — over-the-top celebratory, lots of enthusiasm, make them feel like a rockstar.',
    'Poetic and creative — a fun metaphor or unexpected angle, something memorable and original.',
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

async function generateBirthdayGreeting(name) {
  console.log(`Generating birthday greeting for ${name}...`);
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Write a short birthday message from the company to an employee named ${name}. 2-3 sentences in English. Include a direct mention of the person by name (like "@${name}"). No intro, just the message itself. Use this style: ${pickBirthdayStyle()}`,
      },
    ],
  });
  return message.content[0].text.trim();
}

async function generateAnniversaryGreeting(name, years) {
  console.log(`Generating anniversary greeting for ${name} (${years} yr)...`);
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Write a short work anniversary message from the company to an employee named ${name}. They've been with us for ${years} ${years === 1 ? 'year' : 'years'}. 2-3 sentences in English, with emoji. Focus on their contribution to the team and working together — not a personal celebration. Include a direct mention like "@${name}". No intro, just the message.`,
      },
    ],
  });
  return message.content[0].text.trim();
}


async function postBirthdayMessage(user, greeting) {
  const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
  console.log(`Posting birthday message for ${displayName} to ${CHANNEL}...`);

  const gifUrl = await fetchRandomBirthdayGif();

  // Send text message first
  await slack.chat.postMessage({
    channel: CHANNEL,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🎂 It's ${displayName}'s Birthday!`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: greeting },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Happy Birthday, <@${user.id}>! 🎉`,
        },
      },
    ],
    text: `It's ${displayName}'s Birthday! ${greeting}`,
  });

  // Upload GIF as a file so it renders inline without showing the URL
  if (gifUrl) {
    const gifResponse = await fetch(gifUrl);
    const gifBuffer = Buffer.from(await gifResponse.arrayBuffer());
    await slack.filesUploadV2({
      channel_id: CHANNEL,
      file: gifBuffer,
      filename: 'happy-birthday.gif',
      title: '🎂 Happy Birthday!',
    });
  }
}

async function postAnniversaryMessage(user, greeting, years) {
  const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
  console.log(`Posting anniversary message for ${displayName} (${years} yr) to ${CHANNEL}...`);

  await slack.chat.postMessage({
    channel: CHANNEL,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🏆 ${displayName} — ${years} ${years === 1 ? 'Year' : 'Years'} at the Company!`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: greeting },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Congrats on ${years} ${years === 1 ? 'year' : 'years'} with us, <@${user.id}>! 🎊`,
        },
      },
    ],
    text: `${displayName} — ${years} ${years === 1 ? 'year' : 'years'} at the company! ${greeting}`,
  });
}

async function checkBirthdays(users, month, day) {
  console.log('Checking birthdays...');
  let count = 0;

  for (const user of users) {
    const birthdayValue = user.profile?.fields?.[BIRTHDAY_FIELD_ID]?.value;
    if (!birthdayValue) continue;

    if (isBirthdayOn(birthdayValue, month, day)) {
      const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
      console.log(`🎂 Birthday: ${displayName} (${birthdayValue})`);

      const greeting = await generateBirthdayGreeting(displayName);
      await postBirthdayMessage(user, greeting);
      count++;
    }
  }

  console.log(count === 0 ? 'No birthdays today.' : `Sent ${count} birthday message(s).`);
}

async function checkAnniversaries(users) {
  console.log('Checking work anniversaries...');
  let count = 0;

  for (const user of users) {
    const startDateValue = user.profile?.start_date;
    if (!startDateValue) continue;

    if (isAnniversaryToday(startDateValue)) {
      const years = getAnniversaryYears(startDateValue);
      const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
      console.log(`🏆 Anniversary: ${displayName} (${years} yr)`);

      const greeting = await generateAnniversaryGreeting(displayName, years);
      await postAnniversaryMessage(user, greeting, years);
      count++;
    }
  }

  console.log(count === 0 ? 'No anniversaries today.' : `Sent ${count} anniversary message(s).`);
}

async function main() {
  console.log('Starting Slack Birthday Bot...');

  const users = await getAllUsers(process.env.SLACK_BOT_TOKEN);
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  console.log(`Today is ${month}/${day}.`);

  await checkBirthdays(users, month, day);
  await checkAnniversaries(users);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

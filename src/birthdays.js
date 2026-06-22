import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import Anthropic from '@anthropic-ai/sdk';
import { getAllUsers, isBirthdayOn } from './utils.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const BIRTHDAY_FIELD_ID = process.env.BIRTHDAY_FIELD_ID;
const CHANNEL = process.env.BIRTHDAY_CHANNEL;

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

async function postBirthdayMessage(user, greeting, weekendNote = '') {
  const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
  console.log(`Posting birthday message for ${displayName} to ${CHANNEL}...`);

  const messageText = `🎂 *It's ${displayName}'s Birthday!*\n\n${greeting}\n\nHappy Birthday, <@${user.id}>! 🎉${weekendNote}`;

  const gifUrl = await fetchRandomBirthdayGif();
  if (gifUrl) {
    const gifResponse = await fetch(gifUrl);
    const gifBuffer = Buffer.from(await gifResponse.arrayBuffer());
    await slack.filesUploadV2({
      channel_id: CHANNEL,
      file: gifBuffer,
      filename: 'happy-birthday.gif',
      title: '🎂 Happy Birthday!',
      initial_comment: messageText,
    });
  } else {
    await slack.chat.postMessage({ channel: CHANNEL, text: messageText });
  }
}

function getDatesToCheck() {
  const today = new Date();
  const dates = [{ date: today, weekend: false }];

  // Monday — also check Saturday and Sunday
  if (today.getDay() === 1) {
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - 1);
    const saturday = new Date(today);
    saturday.setDate(today.getDate() - 2);
    dates.push({ date: saturday, weekend: true });
    dates.push({ date: sunday, weekend: true });
  }

  return dates;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

async function main() {
  console.log('Starting Birthday Bot — Birthdays...');

  const users = await getAllUsers(process.env.SLACK_BOT_TOKEN);
  const datesToCheck = getDatesToCheck();
  console.log(`Checking dates: ${datesToCheck.map(d => formatDate(d.date)).join(', ')}`);

  let count = 0;
  for (const user of users) {
    const birthdayValue = user.profile?.fields?.[BIRTHDAY_FIELD_ID]?.value;
    if (!birthdayValue) continue;

    for (const { date, weekend } of datesToCheck) {
      const month = date.getMonth() + 1;
      const day = date.getDate();

      if (isBirthdayOn(birthdayValue, month, day)) {
        const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
        console.log(`🎂 Birthday: ${displayName} (${birthdayValue}${weekend ? ', weekend' : ''})`);
        const greeting = await generateBirthdayGreeting(displayName);
        const weekendNote = weekend
          ? `\n\n_P.S. Your birthday was on ${formatDate(date)} — we always celebrate weekend birthdays on Monday! (Also, my settings suggest I always celebrate weekend birthdays on Monday) 🎉_`
          : '';
        await postBirthdayMessage(user, greeting, weekendNote);
        count++;
        break;
      }
    }
  }

  console.log(count === 0 ? 'No birthdays today.' : `Sent ${count} birthday message(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

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
    'Fake HR/Corporate Mandate (General): Issue an official, highly bureaucratic notice commanding mandatory cake consumption and reckless celebration.',
    'Mildly Aggressive Interrogation (General): Ask an uncomfortable question (e.g., "Where is your party hat?!", "Why are you still sober?!") and demand they fix it.',
    'The Fake Work Emergency (Work/IT): Start with a fake urgent request (e.g., "P1 Blocker", "RE: Overtime") and pivot to assigning them the "urgent task" of partying.',
    'Google Meet / Remote Reality (Remote): Make a joke about celebrating remotely (e.g., wearing sweatpants off-camera, hoping Wi-Fi survives the awkward singing).',
    'The Overly Honest AI (Tech): Mention that you are just a script running on a server, but your mathematical probability of loving them is 100%.',
    'Sarcastic Aging Joke (General): Make a playful joke about getting older (e.g., needing breath mints for the candles, pretending they haven\'t aged a day since joining).',
    'The Reluctant Compliment (General): Pretend that their awesomeness is actually a huge problem for the rest of the team because it makes everyone else look bad.',
    'Slack Notification Chaos (Remote): Threaten to spam their Slack DMs, tag @here, or urge them to aggressively mute all notifications and disappear into a pile of confetti.',
    'Breaking News Alert (General): "BREAKING: Sources confirm..." Report on their birthday as if it\'s an unfolding, chaotic news event.',
    'The Unearned Ego Boost (General): Tell them they are legendary or a superstar, but frame it ironically like "It\'s a tough job being this fabulous, but someone\'s got to do it."',
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
        content: `Act as a slightly unhinged, highly energetic, and playfully sarcastic Slack bot for a remote team.
Write a short, punchy birthday message to an employee named ${name}.
Length: 1-3 sentences max. Keep it crisp.

CRITICAL FORMATTING:
- Mention them exactly as "@${name}" within the text.
- NO intros ("Hey there!"), NO sign-offs ("Best, Team"), NO hashtags. Just the raw message.

TONE & STYLE (CRITICAL - ANTI-SOY PROTOCOL):
- Vibe: Casual, mildly absurd, playfully bossy. Target audience: 25-35 y.o. remote crowd.
- STRICTLY AVOID generic AI adjectives and cliches (e.g., "unstoppable", "incredible journey", "masterpiece", "dreams come true").
- Tone down the forced excitement. Think "chaotic teammate" or "fake corporate bureaucracy" rather than a greeting card.
- Use remote work/tech metaphors (Slack, Google Meet) ONLY if the chosen style specifically calls for it. Otherwise, keep it universally relatable.

Use this specific angle for the message: ${pickBirthdayStyle()}`,
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

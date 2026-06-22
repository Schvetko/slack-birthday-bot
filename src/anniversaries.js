import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import Anthropic from '@anthropic-ai/sdk';
import { getAllUsers } from './utils.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CHANNEL = process.env.ANNIVERSARY_CHANNEL;

async function fetchRandomAnniversaryGif() {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return null;

  try {
    const tags = ['celebration', 'congrats', 'well done', 'bravo', 'you did it'];
    const tag = tags[Math.floor(Math.random() * tags.length)];
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=${encodeURIComponent(tag)}&rating=g`
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

async function postAnniversaryMessage(user, greeting, years, weekendNote = '') {
  const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
  console.log(`Posting anniversary message for ${displayName} (${years} yr) to ${CHANNEL}...`);

  const messageText = `🏆 *${displayName} — ${years} ${years === 1 ? 'Year' : 'Years'} at the Company!*\n\n${greeting}\n\nCongrats on ${years} ${years === 1 ? 'year' : 'years'} with us, <@${user.id}>! 🎊${weekendNote}`;

  const gifUrl = await fetchRandomAnniversaryGif();
  if (gifUrl) {
    const gifResponse = await fetch(gifUrl);
    const gifBuffer = Buffer.from(await gifResponse.arrayBuffer());
    await slack.filesUploadV2({
      channel_id: CHANNEL,
      file: gifBuffer,
      filename: 'congratulations.gif',
      title: '🏆 Work Anniversary!',
      initial_comment: messageText,
    });
  } else {
    await slack.chat.postMessage({ channel: CHANNEL, text: messageText });
  }
}

function getDatesToCheck() {
  const today = new Date();
  const dates = [{ date: today, weekend: false }];

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
  console.log('Starting Birthday Bot — Anniversaries...');

  const users = await getAllUsers(process.env.SLACK_BOT_TOKEN);
  const datesToCheck = getDatesToCheck();
  console.log(`Checking dates: ${datesToCheck.map(d => formatDate(d.date)).join(', ')}`);

  let count = 0;
  for (const user of users) {
    const startDateValue = user.profile?.start_date;
    if (!startDateValue) continue;

    for (const { date, weekend } of datesToCheck) {
      const joined = new Date(startDateValue);
      const years = date.getFullYear() - joined.getFullYear();
      if (
        years >= 1 &&
        joined.getMonth() === date.getMonth() &&
        joined.getDate() === date.getDate()
      ) {
        const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
        console.log(`🏆 Anniversary: ${displayName} (${years} yr${weekend ? ', weekend' : ''})`);
        const greeting = await generateAnniversaryGreeting(displayName, years);
        const weekendNote = weekend
          ? `\n\n_P.S. Your work anniversary was on ${formatDate(date)} — we always celebrate weekend anniversaries on Monday! (Also, my settings suggest I always celebrate weekend anniversaries on Monday) 🎊_`
          : '';
        await postAnniversaryMessage(user, greeting, years, weekendNote);
        count++;
        break;
      }
    }
  }

  console.log(count === 0 ? 'No anniversaries today.' : `Sent ${count} anniversary message(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

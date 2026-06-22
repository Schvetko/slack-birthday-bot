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
    'Start with a dramatic or unexpected statement about birthdays or aging, then pivot to celebrating them. Surprising opener.',
    'Reference something universally relatable about birthdays — cake, candles, getting older — with a funny twist.',
    'Open with "Yo" or a casual street-style greeting. Keep it fun and informal, like a message from a cool friend.',
    'Use a food or cooking metaphor — they\'re the secret ingredient, the missing spice, the chef\'s special.',
    'Frame it as a breaking news alert. "BREAKING: Sources confirm it\'s @name\'s birthday..."',
    'Make a playful IT/tech reference — bugs, deployments, coffee, commits, pull requests. Fun and nerdy.',
    'Write it as if the whole remote team dropped their laptops and opened Slack just for this moment.',
    'Use a video game metaphor — they\'re leveling up, unlocking achievements, new season starting.',
    'Be unexpectedly philosophical for one sentence, then completely flip to party mode.',
    'Start with a fake complaint ("The problem with @name is...") that turns into a compliment.',
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
        content: `Write a short, witty birthday message from the company to an employee named ${name}.
Length: 2-3 sentences max.

CRITICAL FORMATTING:
- Mention them exactly as "@${name}" within the text.
- No intro ("Hey there!"), no sign-off ("Best, Team"), no hashtags. Just the message.

TONE & STYLE:
- Casual, tech-savvy, unexpected, and genuinely funny. Target audience: 25-35 y.o. remote IT crowd.
- STRICTLY AVOID: Boring corporate cliches, generic wishes, and the "you're so great -> we wish you greatness" loops.
- Keep it natural, like a teammate dropping a casual message in Slack, not a HR template. Feel free to use remote work/tech metaphors naturally.

Use this specific angle for the message: ${pickBirthdayStyle()}

Good examples for inspiration (vary the structure, don't copy):
1. "BREAKING: Sources confirm it's @Roman Shelekhov's birthday. Witnesses report confetti, cake, and an uncontrollable urge to mute all Slack notifications. More updates as the party develops."
2. "The problem with @Marina Zavalii is that she makes everyone else look bad by being too good. Happy Birthday — today we officially put our jealousy on hold and just celebrate you."
3. "@Bodya Marchenko just unlocked a new achievement: +1 year of being absolutely unstoppable. Collect your cake, close your IDE, and enjoy your well-deserved day off."`,
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

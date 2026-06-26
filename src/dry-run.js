import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { getAllUsers, isBirthdayOn } from './utils.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const BIRTHDAY_FIELD_ID = process.env.BIRTHDAY_FIELD_ID;

const SEP = '─'.repeat(52);

function parseTargetDate() {
  const arg = process.argv.find((a) => a.startsWith('--date='));
  if (!arg) {
    const today = new Date();
    return { month: today.getMonth() + 1, day: today.getDate() };
  }

  const value = arg.slice('--date='.length);
  const m = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    console.error(`Invalid format: "${value}". Expected MM-DD, e.g. --date=06-15`);
    process.exit(1);
  }
  return { month: parseInt(m[1]), day: parseInt(m[2]) };
}

function getAnniversaryYears(startDateValue) {
  const joined = new Date(startDateValue);
  const today = new Date();
  return today.getFullYear() - joined.getFullYear();
}

function isAnniversaryOn(startDateValue, month, day) {
  if (!startDateValue) return false;
  const joined = new Date(startDateValue);
  const years = getAnniversaryYears(startDateValue);
  return years >= 1 && joined.getMonth() + 1 === month && joined.getDate() === day;
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

async function generateAnniversaryGreeting(name, years) {
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

async function checkBirthdays(users, month, day) {
  console.log('\n🎂 BIRTHDAYS\n' + SEP);

  const found = [];
  for (const user of users) {
    const birthdayValue = user.profile?.fields?.[BIRTHDAY_FIELD_ID]?.value;
    if (birthdayValue && isBirthdayOn(birthdayValue, month, day)) {
      found.push({ user, birthdayValue });
    }
  }

  if (found.length === 0) {
    console.log('No birthdays found.');
    return 0;
  }

  for (const { user, birthdayValue } of found) {
    const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
    console.log(`👤 ${displayName} (@${user.name})`);
    console.log(`📅 Birthday: ${birthdayValue}`);
    process.stdout.write('💬 Generating greeting...');
    const greeting = await generateBirthdayGreeting(displayName);
    process.stdout.write('\r' + ' '.repeat(30) + '\r');
    console.log(`📝 ${greeting}`);
    console.log(SEP);
  }

  return found.length;
}

async function checkAnniversaries(users, month, day) {
  console.log('\n🏆 WORK ANNIVERSARIES\n' + SEP);

  const found = [];
  for (const user of users) {
    const startDateValue = user.profile?.start_date;
    if (startDateValue && isAnniversaryOn(startDateValue, month, day)) {
      found.push({ user, years: getAnniversaryYears(startDateValue) });
    }
  }

  if (found.length === 0) {
    console.log('No anniversaries found.');
    return 0;
  }

  for (const { user, years } of found) {
    const displayName = user.profile?.display_name || user.profile?.real_name || user.name;
    const joined = new Date(user.profile?.start_date).toLocaleDateString('en-GB');
    console.log(`👤 ${displayName} (@${user.name})`);
    console.log(`📅 Start date: ${joined} (${years} ${years === 1 ? 'year' : 'years'} at the company)`);
    process.stdout.write('💬 Generating greeting...');
    const greeting = await generateAnniversaryGreeting(displayName, years);
    process.stdout.write('\r' + ' '.repeat(30) + '\r');
    console.log(`📝 ${greeting}`);
    console.log(SEP);
  }

  return found.length;
}

async function main() {
  const { month, day } = parseTargetDate();
  const dateStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  console.log(`[DRY RUN] Checking date: ${dateStr}`);

  const users = await getAllUsers(process.env.SLACK_BOT_TOKEN);

  const birthdays = await checkBirthdays(users, month, day);
  const anniversaries = await checkAnniversaries(users, month, day);

  console.log(`\n[DRY RUN] Found: ${birthdays} birthday(s), ${anniversaries} anniversary(s). No messages sent to Slack.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

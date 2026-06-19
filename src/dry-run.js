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
    'Techy/IT-flavored — make a playful reference to coding, debugging, deployments, or coffee. Fun and nerdy.',
    'Sweet and heartfelt — warm, sincere, about how much the person means to the team. No tech references.',
    'Funny and playful — light humor, unexpected comparisons, something that makes people smile. Keep it work-appropriate.',
    'Hype and energetic — over-the-top celebratory, lots of enthusiasm, make them feel like a rockstar.',
    'Poetic and creative — a fun metaphor or unexpected angle, something memorable and original.',
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
        content: `Write a short birthday message from the company to an employee named ${name}. 2-3 sentences in English. Include a direct mention of the person by name (like "@${name}"). No intro, just the message itself. Use this style: ${pickBirthdayStyle()}`,
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

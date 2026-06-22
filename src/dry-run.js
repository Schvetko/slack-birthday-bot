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

import { WebClient } from '@slack/web-api';

export function parseBirthday(value) {
  if (!value) return null;

  // YYYY-MM-DD
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { month: parseInt(m[2]), day: parseInt(m[3]) };

  // DD.MM.YYYY
  m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return { month: parseInt(m[2]), day: parseInt(m[1]) };

  // DD.MM
  m = value.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m) return { month: parseInt(m[2]), day: parseInt(m[1]) };

  // MM-DD
  m = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return { month: parseInt(m[1]), day: parseInt(m[2]) };

  // MM/DD
  m = value.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { month: parseInt(m[1]), day: parseInt(m[2]) };

  return null;
}

export function isBirthdayOn(birthdayValue, month, day) {
  const parsed = parseBirthday(birthdayValue);
  if (!parsed) return false;
  return parsed.month === month && parsed.day === day;
}

export async function getAllUsers(token) {
  const slack = new WebClient(token);
  console.log('Fetching all active Slack users...');
  const users = [];
  let cursor;

  do {
    const response = await slack.users.list({ cursor, limit: 200 });
    for (const user of response.members) {
      if (!user.deleted && !user.is_bot && user.id !== 'USLACKBOT') {
        users.push(user);
      }
    }
    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  // users.list does not return custom profile fields — fetch them individually
  console.log(`Fetching profiles for ${users.length} users...`);
  await Promise.all(
    users.map(async (user) => {
      try {
        const { profile } = await slack.users.profile.get({ user: user.id });
        user.profile = profile;
      } catch {
        // leave profile as-is if fetch fails for one user
      }
    })
  );

  console.log(`Fetched ${users.length} active users.`);
  return users;
}

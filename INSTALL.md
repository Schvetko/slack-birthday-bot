# Установка Birthday Bot в Slack

## 1. Создать приложение

1. Перейди на [api.slack.com/apps](https://api.slack.com/apps)
2. Нажми **Create New App**
3. Выбери **From an app manifest**
4. Выбери нужный workspace и нажми **Next**
5. Вставь содержимое файла `slack-app-manifest.json` и нажми **Next** → **Create**

## 2. Установить в workspace

1. В левом меню перейди в **Settings → Install App**
2. Нажми **Install to Workspace**
3. Подтверди запрошенные разрешения

## 3. Скопировать токен

1. После установки скопируй **Bot User OAuth Token** (начинается с `xoxb-`)
2. Добавь его в файл `.env`:

```
SLACK_BOT_TOKEN=xoxb-your-token-here
```

## 4. Настроить переменные окружения

Скопируй `.env.example` в `.env` и заполни все переменные:

```bash
cp .env.example .env
```

| Переменная         | Где взять                                                                 |
|--------------------|---------------------------------------------------------------------------|
| `SLACK_BOT_TOKEN`  | api.slack.com/apps → твоё приложение → Install App → Bot User OAuth Token |
| `CLAUDE_API_KEY`   | console.anthropic.com → API Keys                                          |
| `BIRTHDAY_CHANNEL` | Название канала без `#`, например `general`                               |
| `ANNIVERSARY_CHANNEL` | Название канала без `#`, например `general`                            |
| `BIRTHDAY_FIELD_ID`| Slack Admin → People → Profile fields → ID поля с датой рождения         |

## 5. Добавить бота в канал

Открой нужный канал в Slack и напиши:

```
/invite @Birthday Bot
```

> Если используется `chat:write.public`, приглашение не требуется — бот может писать в публичные каналы без вступления.

## 6. Запустить

```bash
npm install
npm run dry-run        # проверить без отправки в Slack
npm start              # запустить бота
```

Для автоматического запуска каждый день в 9:00 UTC — см. `.github/workflows/birthday-bot.yml`.

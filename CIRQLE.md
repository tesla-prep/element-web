# CIRQLE Messenger (Element Web fork)

Element Web v1.12.30 with a WhatsApp Web layout in CIRQLE style, for CIRQLE staff
in the browser. Branch `cirqle`. The owner-approved concept is the canvas
"CIRQLE Messenger — новый интерфейс" (artboards Main, Empty, NumberPicker,
NewChat, GroupInfo, Phone).

The server side does not change: the relay bot (tesla-prep/cirqle-agents,
`code/team-messenger-relay-bot`) answers Element's own people search and
createRoom, and this UI sends exactly those requests.

## What is ours

Everything lives in two places; upstream files only get one-line hooks marked
`CIRQLE`, so an upstream merge keeps them easily.

| Where | What |
|---|---|
| `apps/web/src/cirqle/` | rail, chat list and its order, number picker, New chat, Group info, header, empty side, composer buttons, timeline sides, forced settings |
| `apps/web/res/themes/light/css/cirqle/` | the look, imported unlayered at the end of `light.pcss` so it wins over Element's layered CSS |
| `apps/web/res/fonts/Source_Serif_4/`, `apps/web/res/img/cirqle/` | heading font (OFL) and the shield logo |
| `cirqle/` | `config.json`, `deploy.sh`, `nginx-next.conf` |

Hooks in upstream files (each one line or a small block):

| File | Hook |
|---|---|
| `res/themes/light/css/light.pcss` | imports `cirqle/_cirqle.pcss` |
| `vector/index.ts` | phones open the app (phone layout), not Element's mobile guide |
| `settings/watchers/ThemeWatcher.ts` | always the light theme |
| `settings/SettingsStore.ts` | `CIRQLE_FORCED_SETTINGS` (bubbles, timestamps, previews, one list, all rooms under All numbers, newest first) |
| `stores/room-list-v3/skip-list/sorters/BaseRecencySorter.ts` | chats sorted by their last message (`cirqle/CirqleActivity.ts`) |
| `stores/room-list-v3/RoomListStoreV3.ts` | a chat moves when the server tells us its last message |
| `stores/room-list-v3/skip-list/sorters/RecencySorter.ts` | muted chats keep their place by recency |
| `stores/ToastStore.ts` | no key backup, verification or analytics toasts |
| `customisations/helpers/UIComponents.ts` | no room directory, integrations, space creation |
| `shouldHideEvent.ts` | room state events (joins, renames) hidden, tombstones kept |
| `structures/LoggedInView.tsx` | rail in place of the space bar, list 360 px |
| `structures/LeftPanel.tsx` | chat list in place of the room list |
| `structures/HomePage.tsx` | empty side |
| `structures/RightPanel.tsx` | Group info for bridged groups and channels |
| `views/rooms/RoomHeader/RoomHeader.tsx` | name without "(WA)", subtitle, back arrow, search and menu |
| `views/rooms/EventTile.tsx` | staff messages and the number's own ghost (what the owner sends from the phone) on our side; customer name hidden in private chats |
| `views/rooms/MessageComposerButtons.tsx` | microphone beside the input |
| `vector/init.tsx`, `i18n/settings.ts` | English for everyone |
| `slash-commands/command.ts` | slash commands: only /plain, /shrug, /tableflip, /unflip, /lenny |
| `autocomplete/NotifProvider.tsx` | no @room |
| `utils/DialogOpener.ts` | room settings open the chat's info panel (header avatar included) |
| `structures/MatrixChat.tsx` | Ctrl/Cmd+K focuses the chat list search, no Spotlight |
| `views/dialogs/UserSettingsDialog.tsx` | settings tabs staff need, a short Preferences (`cirqle/CirqleSettings.tsx`) |
| `settings/tabs/user/HelpUserSettingsTab.tsx` | no access token |
| `views/messages/MPollBody.tsx` | polls show votes, voting is on the phone |
| `context_menus/MessageContextMenu.tsx` | no thread, Share, Copy link, Report, View source; "Delete for everyone" for our own messages (`cirqle/CirqleMessages.ts`) |
| `viewmodels/room/EventTileActionBarViewModel.ts` | hover bar without Reply in thread and Pin |
| `views/dialogs/ConfirmRedactDialog.tsx` | "Delete for everyone?" without a reason |

Hooks that take stock Element's own screens away (from `vector/init.tsx` down) are behind
`isCirqleMessenger()` (`brand` in `cirqle/config.json`), so Element's own unit tests
still test stock Element.

## How chats map to numbers

Each connected WhatsApp number or Telegram account has the bridge's personal
filtering space, renamed by the relay bot "WhatsApp · Main #1"; its topic ends
with the number and the account user `@account_<bridge>_<name>` is a member.
The number picker makes that space Element's active space ("All numbers" is
Home with every room). A chat's number line names the spaces that list it.

## Chat order

Newest message on top, as on WhatsApp: a message anyone in the chat wrote, in or
out, text, media, voice, files, stickers or polls. Room state (joins, renames,
avatars), the bridge bots' and relay bot's messages, edits, reactions and
receipts do not move a chat. Element only looks at the last 20 events sync
loaded; when none of them is a message, `CirqleActivity` asks the server
(`/messages` filtered to message types) for the last one before them, four
rooms at a time, and keeps the answer in `localStorage` (`cirqle_chat_activity`)
until that room's loaded events change. Muted chats keep their place, as on
WhatsApp; low priority chats still go to the bottom, as in stock Element.

The line under a chat's name is that same message (`CirqlePreview`): "You: " for
our own, a colleague's first name for theirs, the sender's short name in groups,
nothing in a private chat, and an icon and a word for photos, voice and files.

## Build and deploy

```sh
pnpm install --frozen-lockfile
./cirqle/deploy.sh          # build, copy to /opt/team-messenger/prod/element-next/webapp
```

Served at https://chat.cirqlecirqle.com/next/ by the host nginx
(`cirqle/nginx-next.conf`, in `/etc/nginx/conf.d/team-messenger.conf`), beside
the stock Element container at `/`. Same origin, so a browser signed in to one is
signed in to the other; Element lets one of them run at a time per browser.

Rollback: remove the `/next` locations from the nginx file (backup in
`/opt/team-messenger/backups/2026-10-23-element-next/`) and reload nginx. The
stock Element at `/` is untouched.

## Updating from upstream

```sh
git fetch upstream --tags
git merge v1.12.NN          # keep the CIRQLE hooks on conflict
pnpm install && ./cirqle/deploy.sh
```

Stay on the version the stock Element at `/` runs until `/next` replaces it:
both share the browser's database, and a newer Element migrates it one way.

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
| `apps/web/src/cirqle/` | rail (Channels only while a number has a channel), chat list and its order, number picker, New chat, New group, Group info, Contact info, member card, header, empty side, composer buttons, timeline sides, forced settings |
| `apps/web/res/themes/light/css/cirqle/` | the look, imported unlayered at the end of `light.pcss` so it wins over Element's layered CSS |
| `apps/web/res/fonts/Source_Serif_4/`, `apps/web/res/img/cirqle/` | heading font (OFL) and the shield logo |
| `cirqle/` | `config.json`, `manifest.json`, `deploy.sh`, `nginx.conf` |
| `apps/web/res/cirqle-icons/` | home screen icons (any and maskable), the iOS icon, favicon, notification badge, iOS launch screens |

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
| `shouldHideEvent.ts` | room state events (joins, renames) hidden, tombstones kept; messages a staff member deleted "for me" hidden (`cirqle/CirqleMessages.ts`) |
| `structures/TimelinePanel.tsx` | the timeline redraws when a message is deleted "for me" |
| `hooks/usePermalink.ts` | a mention or "In reply to" pill names the person without their Matrix ID |
| `structures/LoggedInView.tsx` | rail in place of the space bar, list 360 px |
| `structures/LeftPanel.tsx` | chat list in place of the room list |
| `structures/HomePage.tsx` | empty side |
| `structures/RightPanel.tsx` | Contact info and Group info for bridged chats in place of the room summary and People; the member card in place of user info everywhere (`cirqle/CirqleRightPanel.tsx`) |
| `views/rooms/RoomHeader/RoomHeader.tsx` | name without "(WA)", subtitle, back arrow, search and menu |
| `views/rooms/EventTile.tsx` | staff messages and the number's own ghost (what the owner sends from the phone) on our side; customer name hidden in private chats; in groups the sender's avatar beside the first bubble of a run, which opens their card (`cirqle/CirqleSenderAvatar.tsx`) |
| `views/rooms/MessageComposerButtons.tsx`, `views/rooms/MessageComposer.tsx` | microphone beside the input, on phones too |
| `views/rooms/VoiceRecordComposerTile.tsx` | recording a voice message takes the whole row, WhatsApp Web style: delete, red dot and time, waveform, pause; paused, it plays back and continues (`cirqle/CirqleVoiceRecorder.tsx`) |
| `audio/VoiceRecording.ts`, `audio/VoiceMessageRecording.ts` | pause and resume: the encoder flushes and the audio context is suspended, so the clock and the length stand still |
| `audio/Playback.ts`, `audio/PlaybackClock.ts` | voice messages play through an audio element of their own, so 1.5× and 2× keep the pitch; the clock reads the element (`cirqle/CirqleVoiceSpeed.ts`) |
| `views/audio_messages/RecordingPlayback.tsx` | the speed button while a voice message plays (`cirqle/CirqleVoiceSpeedButton.tsx`) |
| `views/audio_messages/AudioPlayerBase.tsx` | arrow keys skip 5 s without the focused seek bar undoing it |
| `vector/init.tsx`, `i18n/settings.ts` | English for everyone |
| `settings/SettingsStore.ts` (second line) | read receipts and typing always sent: the relay bot passes them on from the number |
| `slash-commands/command.ts` | slash commands: only /plain, /shrug, /tableflip, /unflip, /lenny |
| `autocomplete/NotifProvider.tsx` | no @room |
| `utils/DialogOpener.ts` | room settings open the chat's info panel (header avatar included) |
| `structures/MatrixChat.tsx` | Ctrl/Cmd+K focuses the chat list search, no Spotlight |
| `cirqle/CirqleChatList.tsx` → `cirqle/CirqleWarmup.ts` | the top 12 chats of the list are paged back ahead of time (and the chat under the pointer first), so a chat opens without the 2-4 s spinner |
| `MatrixClientPeg.ts` | no device dehydration at start: staff have no secret storage, and it cost two round trips before the first sync |
| `views/dialogs/UserSettingsDialog.tsx` | settings tabs staff need, a short Preferences (`cirqle/CirqleSettings.tsx`) |
| `settings/tabs/user/HelpUserSettingsTab.tsx` | no access token |
| `views/messages/MPollBody.tsx` | polls show votes, voting is on the phone |
| `context_menus/MessageContextMenu.tsx` | no thread, Share, Copy link, Report, View source; "Delete for everyone" for our own messages, "Delete" for anyone else's with WhatsApp's "Delete for everyone" (in a group where our number is an admin and staff may redact) or "Delete for me" (`cirqle/CirqleMessages.ts`, `cirqle/CirqleDeleteDialog.tsx`); a row of reactions on top and Copy for the whole text (`cirqle/CirqleMessageMenu.tsx`); the emoji picker it opens is a sheet on phones |
| `SupportedBrowser.ts` | phones are a supported browser (`cirqle/CirqleMobile.ts`) |
| `viewmodels/structures/ResizerViewModel.ts` | the chat list never collapses: no auto-collapse under 768 px, the saved `RoomList.isPanelCollapsed` ignored |
| `viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel.ts` | a sender's name without the Matrix ID, even when two have the same name |
| `vector/init.tsx` (second line) | on touch screens the app follows the keyboard and a long press opens a message's menu (`cirqle/CirqleMobile.ts`) |
| `vector/index.html` | `interactive-widget=resizes-content` and `viewport-fit=cover` in the viewport; CIRQLE's title, icons, iOS home screen tags and launch screens; the light theme is preloaded with the page instead of after config.json |
| `vector/init.tsx` (`loadTheme`) | a theme stylesheet still loading after Element's 2 s of polling no longer stops the app with "Your Element is misconfigured" (`cirqleThemeStillLoading` in `cirqle/CirqleFeatures.ts`) |
| `webpack.config.ts` | copies `cirqle/manifest.json` as `manifest.json` and `res/cirqle-icons/` |
| `viewmodels/room/EventTileActionBarViewModel.ts` | hover bar without Reply in thread and Pin |
| `views/dialogs/ConfirmRedactDialog.tsx` | "Delete for everyone?" without a reason |
| `views/dialogs/InviteDialog.tsx` | Add member offers the contacts of the group's own number only (`cirqle/CirqleInviteRefusals.ts`); worded "Add to <group>", names contacts by name or number, and asks "Add +7 918 188 8877 to <group>?" in place of Element's "Invite new contacts to this room?" identity warning (`cirqle/CirqleAddMember.ts`) |
| `views/dialogs/invite/DMRoomTile.tsx` | a suggestion shows the contact's name and number, not the relay bot's Matrix ID |
| `utils/EventUtils.ts` | Edit only while the network takes it (`com.beeper.room_features`, `cirqle/CirqleMessages.ts`) |
| `views/dialogs/ForwardDialog.tsx` | Forward only to chats of the same number, after "Forward to …?" (`cirqle/CirqleForward.ts`) |
| `views/rooms/EventTile/ReactionsRowAdapter.tsx` | our number's reaction counted once, its latest shown (`cirqle/CirqleReactions.ts`) |
| `emojipicker/ReactionPicker.tsx`, `reactions/ReactionsRowButtonViewModel.ts` | a new reaction takes our previous one back, as WhatsApp replaces it |
| `autocomplete/UserProvider.tsx` | @ offers the customers, not colleagues, service users or our own number |
| `serviceworker/index.ts` | Web Push: shows customers' messages, opens the chat on a click (`cirqle/CirqleServiceWorker.ts`) |
| `Notifier.ts` | no Element notification or sound while this device gets Web Push: the service worker shows it |
| `Lifecycle.ts` | sign out drops this device's push subscription (`cirqle/CirqlePush.ts`) |
| `views/rooms/EventTile.tsx` | under a message the network refused: "Not delivered to WhatsApp: …" (`com.beeper.message_send_status`, `cirqle/CirqleDelivery.tsx`); also when our reaction did not get through ("Reaction 🤟 not delivered: Telegram takes only its standard reactions") |
| `emojipicker/ReactionPicker.tsx`, `views/rooms/EventTile/ReactionsRowAdapter.tsx` | reactions limited to what the network takes (`allowed_reactions` in `com.beeper.room_features`): Telegram's standard set; a customer's other emoji can't be added to |
| `packages/shared-components/.../EmojiPicker.tsx`, `QuickReactions.tsx`, `emojipicker/EmojiPickerWithRecents.tsx` | `emojiFilter` prop: only the emoji it lets through are offered (generic, used by the line above) |

Hooks that take stock Element's own screens away (from `vector/init.tsx` down) are behind
`isCirqleMessenger()` (`brand` in `cirqle/config.json`), so Element's own unit tests
still test stock Element.

## How chats map to numbers

Each connected WhatsApp number or Telegram account has the bridge's personal
filtering space, renamed by the relay bot "WhatsApp · Main #1"; its topic ends
with the number and the account user `@account_<bridge>_<name>` is a member.
The number picker picks one number, or several with the round ticks ("3 numbers";
kept in this browser as `cirqle_picked_numbers`); one picked number is also
Element's active space, several or none is Home ("All numbers"). The list reads
the chats each picked space lists itself, plus the groups of a WhatsApp community
listed in it, plus every bridged group the number's account user is in (a number
in a community's announcements, "CIRQLE | Frisco", but not in the community
itself never gets that group in its space); not Element's space, which also
pulls in private chats with anyone in the space. A chat's number line names the
numbers it belongs to. WhatsApp's Status (`status@broadcast`) is never a chat.

The relay bot also keeps, in each number's space:

- `com.cirqle.team_messenger.number_users`: the number's own bridge users, for
  our side of the timeline;
- `com.cirqle.team_messenger.inbox` `{ "connected": false, "number", "state" }` once the
  network ended the number's session: the picker marks it Disconnected, All numbers and
  Write from leave it out, its chats stay readable when it is picked;
- `com.cirqle.team_messenger.contact_phones` `{ "phones": { "<chat's bridge id>":
  "+7…" } }`: customers' numbers WhatsApp hides behind LIDs, shown beside a
  private chat's name when another chat in the list has the same name.

## Phones

The same app on a phone, laid out like WhatsApp there (`_narrow.pcss`, `cirqle/CirqleMobile.ts`):

- under 768 px, and on a phone turned sideways (a coarse pointer, under 500 px tall), the
  list fills the screen and an open chat covers it, with a back arrow; a tablet keeps the
  computer layout, and the list never collapses there;
- the ⋮ menu of the list holds what the rail holds on a computer: New group, Channels,
  Settings, Profile, Sign out;
- every field has 16 px text on a touch screen (iOS zooms into smaller ones), and the app
  is as tall as the visual viewport, so the keyboard raises the composer instead of
  scrolling the page away;
- a long press on a message opens its menu (reactions, Copy, Reply, Forward, Delete) as a
  sheet at the bottom; the desktop hover bar does not show on a tap;
- no "does not support this browser" on phones.

## On the home screen

CIRQLE Messenger installs as an app: Android Chrome offers "Install app", iPhone
Safari has Share → Add to Home Screen. It opens full screen as "CIRQLE" with the
shield icon (`cirqle/manifest.json`: `start_url` `/`, `display` standalone, white
`theme_color` like the header, green `background_color` for Android's launch
screen; `index.html`: `apple-touch-icon`, `apple-mobile-web-app-*` and an
`apple-touch-startup-image` per iPhone size). With `viewport-fit=cover` the app
pads itself by `env(safe-area-inset-*)` (notch, home indicator, a phone turned
sideways) and drops the bottom one while the keyboard is up (`cirqle_keyboard`,
`CirqleMobile.ts`). Every screen staff reach on a phone has its own back arrow or
close button, so nothing needs the browser's. An installed iPhone app keeps its own
storage, separate from Safari: staff sign in once more inside it.

The icons are drawn from `res/img/cirqle/cirqle-shield-outlined-marble.svg` on
CIRQLE green; to redraw them, render that SVG at the sizes in `res/cirqle-icons/`.

## Leave group

Leave group… in Group info (WhatsApp groups only) takes the number itself out of
the group, for everyone at CIRQLE, after a confirmation: the relay bot's
`POST /_matrix/client/unstable/com.cirqle/leave_group` (`cirqle/CirqleLeaveGroup.ts`).
It needs that endpoint deployed (cirqle-agents#174) before this client.

## Group admins and members

Group info marks WhatsApp's admins "Group admin" (power level 50, the creator 75).
Where our number is an admin, each member has a menu, as on WhatsApp: Make group
admin or Dismiss as admin (WhatsApp groups; not for the creator or our own
numbers) and Remove. Make and Dismiss go through the relay bot's
`POST /_matrix/client/unstable/com.cirqle/group_admin` `{room_id, user_id, admin}`
(`cirqle/CirqleGroupAdmin.ts`), which has our bridge build promote or demote the
person on WhatsApp (cirqle-agents#180, tesla-prep/mautrix-whatsapp#5); before
that is deployed the client says the server needs an update. Matrix power levels
can't do it: an admin's 50 may not lower another admin's 50. A member opens their
card. Our number's own ghost (what its phone sends as) is not listed twice.

## Deleting someone else's message

"Delete" on a customer's or colleague's message asks, as WhatsApp does: Delete for
everyone, only in a group where our number is an admin, within the network's time
limit, and only when the staff member's power level lets them redact (the relay
bot raises staff there; the bridge then deletes it as the admin), or Delete for me,
which hides it from this staff member alone, in every window: room account data
`com.cirqle.hidden_events` `{event_ids}`, the latest 500 per chat. Our own messages
keep "Delete for everyone".

## Channels

The rail shows Channels while a picked number has one. New channel (⋮, or ✎ inside
Channels) asks for the WhatsApp number and the name, and creates a public room in
that number's space, which the relay bot answers with the real channel; WhatsApp's
refusal on numbers that can't have channels is shown as the bot words it.

## What the networks refuse

The bridges publish in every chat what the network takes (`com.beeper.room_features`:
WhatsApp edits for 15 minutes, deletes for everyone for 2 days) and answer every
message, edit and delete (`com.beeper.message_send_status`). Edit and "Delete for
everyone" are offered only within those limits, and a refusal is written under the
message. A refused Add member comes back as the reason of the relay bot's
`@newchat_` user leaving (`cirqle/CirqleInviteRefusals.ts`), shown to whoever invited.

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

## Notifications (Web Push)

Customers' new messages reach a device even with CIRQLE Messenger closed, on
phones from the Home Screen (iPhone: Share → Add to Home Screen first). Settings →
Notifications has "Notifications on this device" (`cirqle/CirqleNotificationsTab.tsx`);
a toast offers it once ("Get new messages on this phone", in place of Element's
"Enable desktop notifications"). The browser asks for the permission only on that
click.

```text
CIRQLE Messenger ── PushManager.subscribe(VAPID key) ──> browser's push service (FCM, Apple, Mozilla, Windows)
   └─ POST /pushers/set (pushkey = p256dh; endpoint, auth, events_only) ──> tuwunel
tuwunel ── customer's message ──> matrix.cirqlecirqle.com/_matrix/push/v1/notify ── nginx ──> Sygnal ──> push service ──> sw.js
```

- `cirqle_push` in `cirqle/config.json`: gateway, app id, `show_message_text` (false: "New
  message" only) and the VAPID public key, which `cirqle/deploy.sh` reads from the server
  (`data/sygnal/vapid_public_key.txt`, made by cirqle-agents `deploy/team-messenger/sygnal-keys.sh`).
  Without the key every part of it hides and Element's own Notifications tab stays.
- Who notifies is the account's push rules (`cirqle/CirqlePushRules.ts`), which the client
  keeps: `com.cirqle.customer.*` (underride) notify for bridge ghosts' messages, stickers
  and polls, `com.cirqle.ours` after them keeps everyone else quiet (staff, service users,
  bots), and `com.cirqle.own.<ghost>` (override) the numbers' own ghosts. Element's mutes,
  notices, edits and reactions rules still come first. The homeserver counts unread
  messages with the same rules, so a chat a colleague or the number answered is not unread.
- The service worker has no client state: the app keeps a chat map (number, group) in
  IndexedDB `cirqle-push`. One notification per chat (tag = room id) with its last four
  messages and "via Main #1 · WhatsApp"; none while that chat is open in the window in
  front. A chat's notifications close once it is read anywhere, on every device where
  the app is running (a closed app cannot hear of it).

## Build and deploy

```sh
pnpm install --frozen-lockfile
./cirqle/deploy.sh          # build, copy to /opt/team-messenger/prod/element-next/webapp
```

Served at https://chat.cirqlecirqle.com/ by the host nginx (`cirqle/nginx.conf`,
in `/etc/nginx/conf.d/team-messenger.conf`) since 2026-10-24. Until then it lived at
`/next/` beside the stock Element; `/next` and anything under it now answer 301 to
the same path at `/`, so old links and `/next/#/room/…` keep working, and
`/next/sw.js` hands browsers a service worker that unregisters the old `/next/` one.
The stock Element container (127.0.0.1:8085) is no longer proxied: it stays only
as a rollback.

Rollback to the stock Element at `/` (about a minute): put back
`/opt/team-messenger/backups/2026-10-24-root-switch/team-messenger.conf`, run
`nginx -t` and `systemctl reload nginx`.

## Updating from upstream

```sh
git fetch upstream --tags
git merge v1.12.NN          # keep the CIRQLE hooks on conflict
pnpm install && ./cirqle/deploy.sh
```

Stay on the version the stock Element container runs (1.12.30) while it is the
rollback: both use the browser's database, and a newer Element migrates it one way.

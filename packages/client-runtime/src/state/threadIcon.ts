import { THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH, type ThreadIcon } from "@t3tools/contracts";

/** Uploads over this are rejected before any decoding; the stored result is far smaller. */
export const THREAD_ICON_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const THREAD_ICON_SOURCE_IMAGE_TYPES: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/webp",
];
const THREAD_ICON_RECENT_EMOJI_LIMIT = 16;

export function validateThreadIconSourceFile(file: {
  readonly type: string;
  readonly size: number;
}): string | null {
  if (!THREAD_ICON_SOURCE_IMAGE_TYPES.includes(file.type)) {
    return "Choose a PNG, JPEG or WebP image.";
  }
  if (file.size > THREAD_ICON_SOURCE_MAX_BYTES) {
    return "Choose an image under 5 MB.";
  }
  return null;
}

export function threadIconImageFits(dataUrl: string): boolean {
  return dataUrl.length <= THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH;
}

/** The icon a thread shows in place of the No project placeholder, or null for the placeholder. */
export function resolveThreadIcon(
  thread: { readonly icon?: ThreadIcon | null | undefined },
  project: { readonly isScratch?: boolean | undefined } | null | undefined,
): ThreadIcon | null {
  return project?.isScratch === true ? (thread.icon ?? null) : null;
}

export function pushRecentThreadEmoji(
  recents: ReadonlyArray<string>,
  emoji: string,
  limit = THREAD_ICON_RECENT_EMOJI_LIMIT,
): string[] {
  return [emoji, ...recents.filter((candidate) => candidate !== emoji)].slice(0, limit);
}

export function sanitizeRecentThreadEmojis(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .slice(0, THREAD_ICON_RECENT_EMOJI_LIMIT);
}

export interface ThreadIconEmoji {
  readonly emoji: string;
  readonly name: string;
}

// One "emoji keywords…" line each; keywords make the search forgiving.
const EMOJI_LINES = `
😀 grinning smile happy
😂 joy laugh tears funny
🙂 slight smile
😉 wink
😍 heart eyes love
🤩 star struck wow
😎 cool sunglasses
🤔 thinking hmm
🤯 mind blown
😴 sleeping tired
🥳 party celebrate
😇 angel halo
🤓 nerd glasses
🥶 cold freezing
😱 scream shocked
🤖 robot bot ai
👻 ghost
💀 skull
👽 alien
😺 cat face
👋 wave hello hi
👍 thumbs up yes like
👎 thumbs down no
👏 clap applause
🙌 raised hands
🙏 pray thanks please
💪 muscle strong flex
🧠 brain mind think
👀 eyes look watching
❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
💔 broken heart
💯 hundred perfect score
🔥 fire hot lit
✨ sparkles magic new
⭐ star favorite
🌟 glowing star
⚡ lightning bolt zap fast
💥 boom collision
🎉 party popper tada celebrate
🎁 gift present
🎈 balloon
🏆 trophy win award
🥇 gold medal first
🎯 target bullseye goal
🎲 dice game random
🎮 game controller video games
🕹️ joystick arcade
🧩 puzzle piece
🎨 art palette paint design
🎭 theater masks drama
🎬 clapper movie film
🎤 microphone sing karaoke
🎧 headphones music listen
🎵 music note song
🎸 guitar rock
🎹 piano keyboard music
📷 camera photo
📹 video camera record
📺 television tv
📻 radio
💻 laptop computer code
🖥️ desktop computer monitor
⌨️ keyboard typing
🖱️ mouse
💾 floppy disk save
💿 cd disc
📱 phone mobile smartphone
☎️ telephone call
🔋 battery power
🔌 plug electric
💡 light bulb idea
🔦 flashlight
🕯️ candle
🔧 wrench tool fix
🔨 hammer build
🛠️ hammer wrench tools build repair
⚙️ gear settings cog
🔩 nut bolt
🧰 toolbox
🧲 magnet
🔬 microscope science
🔭 telescope space
🧪 test tube experiment lab
🧬 dna biology
💊 pill medicine
🩺 stethoscope health doctor
🔒 lock secure private
🔓 unlocked open
🔑 key password
🛡️ shield security protect
🚨 siren alert alarm
📦 package box delivery
📫 mailbox mail
✉️ envelope email letter
📝 memo note write
📄 page document
📚 books library read
📖 open book reading
🔖 bookmark
📌 pushpin pin
📎 paperclip attach
📏 ruler measure
📐 triangle ruler geometry
✂️ scissors cut
🗂️ card index dividers folders
🗄️ file cabinet archive database
🗑️ wastebasket trash delete
📁 folder
📂 open folder
📅 calendar date schedule
⏰ alarm clock time
⏳ hourglass waiting
⌛ hourglass done
🕐 clock time
📊 bar chart stats analytics
📈 chart increasing growth trend up
📉 chart decreasing down
💰 money bag cash
💵 dollar banknote money
💳 credit card payment
🛒 shopping cart
🛍️ shopping bags
🏷️ label tag price
🌐 globe web internet network
🌍 earth globe europe africa
🌎 earth globe americas
🗺️ world map
🧭 compass navigate
🏠 house home
🏢 office building work
🏫 school education
🏥 hospital
🏦 bank
🏭 factory industry
⛺ tent camping
🌅 sunrise
🌇 sunset city
🌃 night city stars
🌈 rainbow
☀️ sun sunny
🌙 moon night
⭐ star
☁️ cloud
🌧️ rain cloud
❄️ snowflake snow winter
🌊 wave ocean sea water
🌋 volcano
⛰️ mountain
🌲 evergreen tree pine
🌳 tree
🌴 palm tree tropical
🌱 seedling sprout plant grow
🌸 cherry blossom flower
🌹 rose flower
🌻 sunflower
🍀 four leaf clover luck
🍎 apple red fruit
🍌 banana
🍓 strawberry
🍕 pizza food
🍔 burger hamburger
🌮 taco
🍣 sushi
🍜 ramen noodles
🍩 donut
🍪 cookie
🎂 birthday cake
☕ coffee hot drink
🍵 tea
🍺 beer
🍷 wine
🐶 dog puppy
🐱 cat kitten
🐭 mouse
🦊 fox
🐻 bear
🐼 panda
🦁 lion
🐸 frog
🐵 monkey
🐔 chicken
🐧 penguin
🦉 owl
🦄 unicorn
🐝 bee honey
🦋 butterfly
🐢 turtle
🐙 octopus
🐬 dolphin
🐳 whale
🦈 shark
🐉 dragon
🚀 rocket launch space
🛸 flying saucer ufo
✈️ airplane flight travel
🚁 helicopter
🚗 car automobile
🚕 taxi
🚌 bus
🚂 train locomotive
🚲 bicycle bike
🛵 scooter
⛵ sailboat
🚢 ship
⚓ anchor
🏁 checkered flag finish race
🚩 red flag
⚽ soccer football
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏓 ping pong
🎳 bowling
🥊 boxing glove
♟️ chess pawn strategy
🧸 teddy bear toy
🪄 magic wand
🔮 crystal ball
🧿 evil eye
♻️ recycle
✅ check mark done yes
❌ cross mark no
❓ question mark
❗ exclamation mark
⚠️ warning caution
🚫 prohibited banned
➕ plus add
➖ minus
🔍 magnifying glass search
🔔 bell notification
🔗 link chain
💬 speech bubble chat message
💭 thought bubble
🗨️ speech balloon
📣 megaphone announce
📢 loudspeaker
🧵 thread spool
🪡 needle sewing
🧶 yarn knitting
🪐 ringed planet saturn
🌌 milky way galaxy
☄️ comet
🌠 shooting star
`;

export const THREAD_ICON_EMOJIS: ReadonlyArray<ThreadIconEmoji> = (() => {
  const seen = new Set<string>();
  const entries: ThreadIconEmoji[] = [];
  for (const line of EMOJI_LINES.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const space = trimmed.indexOf(" ");
    const emoji = trimmed.slice(0, space);
    if (seen.has(emoji)) continue;
    seen.add(emoji);
    entries.push({ emoji, name: trimmed.slice(space + 1) });
  }
  return entries;
})();

export function filterThreadIconEmojis(query: string): ReadonlyArray<ThreadIconEmoji> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return THREAD_ICON_EMOJIS;
  return THREAD_ICON_EMOJIS.filter(
    (entry) => entry.emoji === query.trim() || terms.every((term) => entry.name.includes(term)),
  );
}

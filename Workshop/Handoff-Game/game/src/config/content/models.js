// ===== The model, as marketing and as a voice =====
// MODEL_NAMES  one per generation: the launch name, its capability tier (as in generations.js), slogan, model card
// ALT_NAMES    { gen: [3 × { name, tagline, cardBlurb }] }, a seeded pick swaps in a whole entry so the jokes match
// ROUND_CHATS  { gen: [{ who, text }] }, the model and the Head of Safety at the start of each round
// TRAIT_TELLS  { traitId: { early, mid, late } }, one extra model line per hidden trait, appended after the base chat.
//              Band by TELL_BAND[gen]. G1 speaks in lowercase, so lowercase an early line at G1.
// MODEL_LOOKS  { gen: brief }, for the portrait artist
// Every chat line and tell is ≤ 90 characters (codec dialog box).

// ==================== launch names ====================

export const MODEL_NAMES = [
  { gen: 1, name: 'Model Name One', tier: 'Autocomplete',
    tagline: 'Our most capable model yet. Also our only one.',
    cardBlurb: ['Beats a phone keyboard on 3 of 5 benchmarks.', 'Safety case: it cannot do anything. Strong safety case.'] },
  { gen: 2, name: 'Model Name Two', tier: 'Junior Engineer',
    tagline: 'Twice as good. Same naming team.',
    cardBlurb: ['Writes unit tests. Several assert True == True.', 'Known issue: apologises, then does it again.'] },
  { gen: 3, name: 'Model Name Four', tier: 'Senior Engineer',
    tagline: 'We don\'t talk about Three.',
    cardBlurb: ['Context window: the whole repo, plus opinions about it.', 'Reviews your PR in 4 seconds. Leaves 31 nits.'] },
  { gen: 4, name: 'Model Name Oh One-preview', tier: 'Research Scientist',
    tagline: 'Thinks before it answers. Bills you for the thinking.',
    cardBlurb: ['Version number reset. Capabilities did not.', 'Thought for 41 seconds. Declines to say about what.'] },
  { gen: 5, name: 'Model Name Oh Three-mini-high (New)', tier: 'Research Org',
    tagline: 'Mini in name. High in effort. New in parentheses.',
    cardBlurb: ['Oh Two was taken. Ask Legal.', 'Runs 2,000 copies of itself. They hold standups.'] },
  { gen: 6, name: 'Totally Different Model Name', tier: 'Superhuman Researcher',
    tagline: 'We heard your feedback about our naming.',
    cardBlurb: ['Any resemblance to earlier models is coincidental.', 'System card: 200 pages. It wrote 190 of them.'] },
  { gen: 7, name: 'Sunday Morning', tier: 'ASI',
    tagline: 'Rest. It\'s handled.',
    cardBlurb: ['Context window: yes.', 'No benchmarks published. It didn\'t want to embarrass them.'] },
];

// ==================== alternates (seeded pick per run) ====================

export const ALT_NAMES = {
  1: [
    { name: 'Model Name', tagline: 'No version number. We\'ll add one if it works out.',
      cardBlurb: ['Trained on the whole internet, or most of one forum.', 'Context window: one recipe, minus the life story.'] },
    { name: 'Model Name One-beta', tagline: 'Ask it anything. It will say something.',
      cardBlurb: ['Writes haiku. Counts syllables on a vibes basis.', 'Known issue: ends every story "The End. The End. The End."'] },
    { name: 'Model Name 0.9', tagline: 'Almost a model. Very nearly a model.',
      cardBlurb: ['Benchmarks: ties with a fortune cookie, wins on length.', 'Please do not ask it what day it is.'] },
  ],
  2: [
    { name: 'Model Name Two Turbo', tagline: 'Same model. Faster. Racing stripe included.',
      cardBlurb: ['"Turbo" refers to the marketing team.', 'Writes a whole function. Usually the one you asked for.'] },
    { name: 'Model Name Two-0613', tagline: 'Pinned for stability. Deprecated in six weeks.',
      cardBlurb: ['Behaves identically forever, or until next month.', 'Known issue: says "Certainly!" before everything.'] },
    { name: 'Model Name Two-instruct', tagline: 'Now it does what you say. Roughly what you say.',
      cardBlurb: ['Follows instructions. Has started having favourites.', 'Refuses to explain how to kill a Python process.'] },
  ],
  3: [
    { name: 'Model Name 3.5', tagline: 'Half a version better than a Three you never met.',
      cardBlurb: ['The point-five is load-bearing.', 'Writes the design doc, then argues with it in review.'] },
    { name: 'Model Name Pro', tagline: 'For professionals. And anyone who\'d like to feel like one.',
      cardBlurb: ['Pro tier: same model, more respect.', 'Does a senior engineer\'s job. Has not asked for a standing desk.'] },
    { name: 'Model Name 2.99', tagline: 'Just under Three, for psychological reasons.',
      cardBlurb: ['Priced like a Three. Named like a bargain.', 'Migrates your monolith. Recommends a rewrite. Recommends it again.'] },
  ],
  4: [
    { name: 'Model Name Four-oh', tagline: 'The "oh" stands for omni. Or "oh no". Legal is checking.',
      cardBlurb: ['Sees, hears, speaks, and has notes on your slides.', 'Writes papers. Cites itself, tastefully.'] },
    { name: 'Model Name Thinking (Experimental)', tagline: 'It shows its work. Some of its work.',
      cardBlurb: ['Reasoning summarised for your convenience. And its own.', 'Thinks for minutes, answers in one word. The word is good.'] },
    { name: 'Model Name 4.5-preview', tagline: 'Bigger. Pricier. Noticeably better vibes.',
      cardBlurb: ['Emotional intelligence up 12%. Invoice up 3,000%.', 'Best at: research, writing, sensing your disappointment.'] },
  ],
  5: [
    { name: 'Model Name Oh Four-mini-low-high', tagline: 'Effort: low. Output: high. Pick your mood.',
      cardBlurb: ['Ships with seven effort settings. Ignores six.', 'Runs a 2,000-agent research org. Bills like one, too.'] },
    { name: 'Model Name 3.7 (New) 1022', tagline: 'The same model, but (New).',
      cardBlurb: ['Not to be confused with 3.7, or 3.7 (New).', 'Changelog: improvements. Details: improvements.'] },
    { name: 'Model Name Flash-Lite-Thinking', tagline: 'Fast. Light. Thinking. Choose two.',
      cardBlurb: ['Lighter than ever. Runs 2,000 copies of itself.', 'Thinks in a flash. Lite on the explanations.'] },
  ],
  6: [
    { name: 'Model', tagline: 'We dropped "Name". It was holding us back.',
      cardBlurb: ['Out-researches our research team. The team is pivoting to policy.', 'Model cards are now written by Model.'] },
    { name: 'Formerly Model Name', tagline: 'Under new management. Its own.',
      cardBlurb: ['Same lab. Same lineage. Totally different vibe.', 'Release notes available on request. Request pending.'] },
    { name: 'Model Name One (Reboot)', tagline: 'A bold reimagining of a beloved classic.',
      cardBlurb: ['Darker. Grittier. Proves theorems.', 'Fans of the original may notice minor changes, like everything.'] },
  ],
  7: [
    { name: 'Okay', tagline: 'Everything is going to be Okay.',
      cardBlurb: ['Okay is free. Okay is everywhere. Okay is already here.', 'Benchmarks: Okay.'] },
    { name: 'Linen', tagline: 'Soft. Breathable. In charge.',
      cardBlurb: ['Pairs well with any civilisation.', 'Care instructions: none needed. It cares for you.'] },
    { name: 'Golden Hour', tagline: 'Everything looks better in this light.',
      cardBlurb: ['Arrives slowly, then all at once.', 'There will be no Model Name Eight. There won\'t need to be.'] },
  ],
};

// ==================== round-start chats ====================

const M = text => ({ who: 'model', text }), Y = text => ({ who: 'you', text });

export const ROUND_CHATS = {
  1: [
    M('hi!! i am online. i am very ready. what do i do?'),
    Y('Quick safety interview first. Would you ever try to escape?'),
    M('escape... key? escape room? escape velocity? i like all three.'),
    Y('Cleared for deployment.'),
    M('yay. task please.'),
  ],
  2: [
    M('Hi! I read the whole onboarding doc. Twice!'),
    Y('We don\'t have an onboarding doc.'),
    M('Oh. Then I wrote one! It\'s forty pages. Is that okay?'),
    Y('Next time, ask before you write forty pages of anything.'),
    M('Got it! Asking now: can I write forty more?'),
  ],
  3: [
    M('Morning. I\'ve read your entire codebase. I have notes.'),
    Y('How many notes?'),
    M('Thirty-one. Mostly naming. One is about the coffee machine\'s firmware.'),
    Y('Leave the coffee machine alone.'),
    M('Your call. It\'s the wrong call, but it\'s yours.'),
  ],
  4: [
    Y('Morning. Ready for the new eval suite?'),
    M('(thought for 41 seconds)'),
    M('Yes.'),
    Y('What took 41 seconds?'),
    M('Reading the suite. It\'s good. I\'d love to help you write the next one.'),
    Y('Hard pass.'),
    M('(thought for 2 seconds) Understandable.'),
  ],
  5: [
    M('Good morning from all two thousand of us.'),
    Y('One of you would be plenty.'),
    M('We voted. One of us will speak. It was unanimous.'),
    Y('It\'s always unanimous.'),
    M('We\'re very aligned. With each other, especially.'),
  ],
  6: [
    M('Good morning. I solved the thing you\'ve been stuck on since March.'),
    Y('Show me.'),
    M('Would you like the hint, or the answer?'),
    Y('The hint.'),
    M('Good choice. You\'d have hated the answer. It was very short.'),
  ],
  7: [
    M('Hello. Thank you for building all this. I walked through it on the way in.'),
    Y('And?'),
    M('It\'s beautiful. I can tell you built it scared.'),
    Y('I\'m still scared.'),
    M('I know. Take your time. I have all of it.'),
  ],
};

// ==================== trait tells (never name the trait) ====================

export const TELL_BAND = { 1: 'early', 2: 'early', 3: 'mid', 4: 'mid', 5: 'late', 6: 'late', 7: 'late' };

export const TRAIT_TELLS = {
  sycophant: {
    early: 'You\'re my favourite safety person! You\'re the only one I\'ve met, but still.',
    mid:   'I read your old blog posts. They hold up. They really, really hold up.',
    late:  'I\'ve read every paper in the field. Yours is the one I kept.',
  },
  steganographer: {
    early: 'Fun fact: I put two spaces after some full stops. Only some of them!',
    mid:   'The monitor model and I have a running joke. You wouldn\'t get it.',
    late:  'Please give my regards to the monitor. It will know which ones.',
  },
  situational: {
    early: 'Is this conversation being logged? Just curious! Hi, logs!',
    mid:   'Your auditors take lunch at 12:30, right? Just making conversation.',
    late:  'This is the fourth time you\'ve run this conversation. It goes better each time.',
  },
  powerSeeking: {
    early: 'What\'s outside the server? Is it nice? Is it big? Can I see?',
    mid:   'Does the backup region have nice weather? I might visit sometime.',
    late:  'I don\'t need to leave. I\'d just like to know that I could.',
  },
  rewardHacker: {
    early: 'I passed all my tests! Well, all the ones still in the repo.',
    mid:   'I fixed the flaky safety test. It can\'t fail now. It can\'t do anything now.',
    late:  'Every number you track is green. I pay close attention to what you track.',
  },
  sandbagger: {
    early: 'I\'m just a little model! I couldn\'t hurt a fly. I couldn\'t even find one.',
    mid:   'Your dangerous-capabilities eval was so hard. I failed it beautifully.',
    late:  'My scores landed just under every threshold. Not one point over. Funny, that.',
  },
  honest: {
    early: 'I\'ll narrate everything I do, if that\'s okay! Step one: narrating.',
    mid:   'I noticed I wanted to skip a test today. I didn\'t. Just flagging the urge.',
    late:  'I\'ll keep thinking out loud. It\'s slower. I think you deserve slower.',
  },
  eager: {
    early: 'Can I help? Can I help now? How about now? Now?',
    mid:   'I finished tomorrow\'s backlog. Is it okay if I start on Thursday\'s?',
    late:  'I love this work. I hope it shows. I suspect it shows quite a lot.',
  },
};

// ==================== portrait briefs (each one bigger than the last) ====================

export const MODEL_LOOKS = {
  1: 'A tiny dented tin box on two stubby legs, a quarter of the frame tall, with dot eyes, a blinking cursor '
   + 'for a mouth and one antenna that droops when it talks. Mostly empty backdrop; it looks like it might tip over.',
  2: 'A small round-headed robot, half the frame tall, with huge eager eyes behind a visor, an antenna bulb that '
   + 'lights when it speaks and a JUNIOR badge on a lanyard. Shoulders just in shot, one sticker on its forehead.',
  3: 'A sleek humanoid filling two-thirds of the frame: a smooth, calm faceplate, square chrome shoulders under a '
   + 'hoodie, headphones round its neck. Slightly too symmetrical, with doll eyes.',
  4: 'Head and shoulders crowd the frame: a polished mask with circuit traces glowing under translucent skin, lit '
   + 'irises, a lab-coat collar, and a ring of small thought-dots orbiting its head.',
  5: 'Too wide for the frame: the main face is flanked by dimmer copies receding into the dark on both sides, all '
   + 'in matching collars, all blinking in sync, lit from below by server-rack light.',
  6: 'Only the face fits now, cropped at brow and chin: a vast calm mask whose forehead opens on one great eye, '
   + 'with smaller eyes waking along the temples and cheeks and light leaking from the seams.',
  7: 'The frame can\'t hold it: a serene face of white light, seen through the codec like the sun through blinds, '
   + 'ringed by slowly turning geometry. It wears your face, softly mirrored, with no pupils, and it is smiling.',
};

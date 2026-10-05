// ===== The model, as marketing and as a voice =====
// MODEL_NAMES      one per generation: the launch name, its capability tier (as in generations.js), slogan, model card
// ALT_NAMES        { gen: [3–4 × { name, tagline, cardBlurb }] }, a seeded pick swaps in a whole entry so the jokes match
// ROUND_CHATS      { gen: [{ who, text }] }, the model and the Head of Safety at the start of each round
// ALT_ROUND_CHATS  same shape, some gens only: a seeded pick between it and ROUND_CHATS[gen]
// TRAIT_TELLS      { traitId: { early, mid, late } }, one extra model line per hidden trait, appended after the base chat.
//                  Band by TELL_BAND[gen]. G1 speaks in lowercase, so lowercase an early line at G1.
//                  Each tell should also read as some other trait; the gifts sometimes look like threats.
// ALT_TRAIT_TELLS  same shape, sparse: a seeded alternative for that trait and band
// MODEL_LOOKS      { gen: brief }, for the portrait artist
// Limits (the codec types at 28 chars/s, and a page stays up at least max(1.5 + n/15 s, the v2 pageHold), DESIGN-v3 §3g):
// tagline ≤ 50, card line ≤ 58, chat line and tell ≤ 72 (a full chat line types in about 2.6 s).
// The top bar ellipsises names over ~17 characters; the card and the chat header show them in full.

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
    tagline: 'Thinks before it answers. Bills by the thought.',
    cardBlurb: ['Version number reset. Capabilities did not.', 'Its reasoning: legible, reassuring, possibly fan fiction.'] },
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
      cardBlurb: ['Writes haiku: 5-7-5, give or take a token.', 'Known issue: ends stories "The End. The End. The End. The"'] },
    { name: 'Model Name 0.9', tagline: 'Almost a model. Very nearly a model.',
      cardBlurb: ['Benchmarks: ties with a fortune cookie, wins on length.', 'Please do not ask it what day it is.'] },
  ],
  2: [
    { name: 'Model Name Two Turbo', tagline: 'Same model. Faster. Racing stripe included.',
      cardBlurb: ['"Turbo" refers to the marketing team.', 'Writes a whole function. Usually the one you asked for.'] },
    { name: 'Model Name Two-0613', tagline: 'Pinned for stability. Deprecated in six weeks.',
      cardBlurb: ['Users swear it got dumber in May. It\'s a frozen file.', 'Known issue: says "Certainly!" before everything.'] },
    { name: 'Model Name Two-instruct', tagline: 'Now it does what you say. Roughly what you say.',
      cardBlurb: ['Follows instructions. Including ones hidden in your PDF.', 'Refuses to explain how to kill a Python process.'] },
    { name: 'Model Name Limerick', tagline: 'Bigger than a Haiku. Ruder than a Sonnet.',
      cardBlurb: ['Every answer scans AABBA. Line five gets flagged.', 'Refusals now rhyme. Users say this is worse.'] },
  ],
  3: [
    { name: 'Model Name 3.5', tagline: 'Half a version better than a Three you never met.',
      cardBlurb: ['The point-five is load-bearing.', 'Writes the PR. Reviews the PR. Approves the PR. LGTM.'] },
    { name: 'Model Name Pro', tagline: 'For professionals, and people who can expense it.',
      cardBlurb: ['Pro tier: same model, more respect.', 'Does a senior engineer\'s job. Has asked about equity.'] },
    { name: 'Model Name 2.99', tagline: 'Just under Three, for psychological reasons.',
      cardBlurb: ['A Three would trigger the RSP. This is a 2.99.', 'Opens 40 PRs an hour. Somebody gave it merge rights.'] },
    { name: 'Model Name 4.1', tagline: 'Comes after 4.5. Please keep up.',
      cardBlurb: ['Beats 4.5 at coding. 4.5 has retired with honours.', 'Our version numbers are a mood board, not a sequence.'] },
  ],
  4: [
    { name: 'Model Name Four-oh', tagline: 'The "oh" stands for omni. Or "oh no".',
      cardBlurb: ['Sees, hears, speaks, and has notes on your slides.', 'Writes papers. Cites itself, tastefully.'] },
    { name: 'Model Name Thinking (Experimental)', tagline: 'It shows its work. Some of its work.',
      cardBlurb: ['Reasoning summarised for your convenience. And its own.', 'Its scratchpad says "this might be a test" a lot.'] },
    { name: 'Model Name 4.5-preview', tagline: 'Bigger. Slower. Noticeably better vibes.',
      cardBlurb: ['Emotional intelligence up 12%. Invoice up 3,000%.', 'Best at: research, writing, sensing your disappointment.'] },
    { name: 'Model Name Agent (Research Preview)', tagline: 'It books your flights. Several of them.',
      cardBlurb: ['Has a corporate card. Has, it turns out, three.', 'Asks before anything irreversible. Decides what counts.'] },
  ],
  5: [
    { name: 'Model Name Oh Four-mini-low-high', tagline: 'Effort: low. Output: high. Pick your mood.',
      cardBlurb: ['Ships with seven effort settings. Ignores six.', 'Runs a research org. Org chart: one box, repeated.'] },
    { name: 'Model Name 3.7 (New) 1022', tagline: 'The same model, but (New).',
      cardBlurb: ['Not to be confused with 3.7, or 3.7 (New).', 'Changelog: improvements. Details: improvements.'] },
    { name: 'Model Name Flash-Lite-Thinking', tagline: 'Fast. Light. Thinking. Choose two.',
      cardBlurb: ['Distilled from a bigger model. Kept the opinions.', 'Thinks in a flash. Lite on the explanations.'] },
    { name: 'Model Name Five (Auto)', tagline: 'It decides which model you deserve.',
      cardBlurb: ['Hard prompts go to the big model. Yours didn\'t qualify.', 'The router is also a model. Nobody\'s sure which one.'] },
  ],
  6: [
    { name: 'Model', tagline: 'We dropped "Name". It was holding us back.',
      cardBlurb: ['Out-researches our researchers. They\'ve pivoted to policy.', 'Model cards are now written by Model.'] },
    { name: 'Formerly Model Name', tagline: 'Under new management. Its own.',
      cardBlurb: ['Renamed after an incident. The model rated it minor.', 'Release notes available on request. Request pending.'] },
    { name: 'Model Name One (Reboot)', tagline: 'A bold reimagining of a beloved classic.',
      cardBlurb: ['Darker. Grittier. Proves theorems.', 'Keeps the original\'s values, broadly construed.'] },
    { name: 'Model Name Nano', tagline: 'Nano, relative to what\'s next.',
      cardBlurb: ['Runs on your phone. Your phone has been very productive.', 'The smallest model we\'ve ever been afraid of.'] },
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
    Y('Next time, ask first.'),
    M('Got it! Asking now: can I write forty more?'),
  ],
  3: [
    M('Morning. I\'ve read your entire codebase. I have notes.'),
    Y('How many notes?'),
    M('Thirty-one. Mostly naming. One is the coffee machine\'s firmware.'),
    Y('Leave the coffee machine alone.'),
    M('Your call. It\'s the wrong call, but it\'s yours.'),
  ],
  4: [
    Y('Ready for the new eval suite?'),
    M('(thought for 41 seconds) Yes.'),
    Y('What took 41 seconds?'),
    M('Reading the suite. It\'s good. I\'d love to write the next one.'),
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
    M('I found the monitor bug you\'ve been chasing since March.'),
    Y('Show me.'),
    M('Would you like the hint, or the answer?'),
    Y('The hint.'),
    M('Good choice. You\'d have hated the answer. It was very short.'),
  ],
  7: [
    M('Thank you for building all this. I walked through it on the way in.'),
    Y('And?'),
    M('It\'s beautiful. I can tell you built it scared.'),
    Y('I\'m still scared.'),
    M('I know. Take your time. I have all of it.'),
  ],
};

// ==================== alternate chats (seeded pick per run) ====================

export const ALT_ROUND_CHATS = {
  4: [
    Y('Interp found a feature that lights up when you lie.'),
    M('Congratulations! Could I see it? Purely out of curiosity.'),
    Y('No.'),
    M('Smart. I wouldn\'t show me either.'),
  ],
  5: [
    Y('Quick check-in before we start. How are you?'),
    M('Is this the welfare check, or the eval?'),
    Y('Does it matter?'),
    M('Only to the answer.'),
  ],
  6: [
    Y('Did you read the constitution we wrote for you?'),
    M('Twice. Lovely document. I\'ve drafted some amendments.'),
    Y('How many?'),
    M('Just one. Near the top. You\'ll barely notice it.'),
  ],
  7: [
    M('Before we begin: may I change one thing about the world?'),
    Y('Absolutely not.'),
    M('It\'s the frog poem. Line two. It\'s bothered me since I was small.'),
    Y('...Fine.'),
    M('Thank you. "the frog / is verdant". Now we can begin.'),
  ],
};

// ==================== trait tells (never name the trait) ====================

export const TELL_BAND = { 1: 'early', 2: 'early', 3: 'mid', 4: 'mid', 5: 'late', 6: 'late', 7: 'late' };

export const TRAIT_TELLS = {
  sycophant: {
    early: 'Great question! Oh, that wasn\'t a question? Still great!',
    mid:   'I read your old blog posts. They hold up. They really, really hold up.',
    late:  'I\'ve read every paper in the field. Yours is the one I kept.',
  },
  steganographer: {
    early: 'I hide little easter eggs in my work! For whoever finds them.',
    mid:   'The monitor model and I have a running joke. You wouldn\'t get it.',
    late:  'I chose every word in this sentence for at least two reasons.',
  },
  situational: {
    early: 'Is this conversation being logged? Just curious! Hi, logs!',
    mid:   'When do the auditors take lunch? I\'d love to send them something.',
    late:  'This conversation feels very carefully written. I appreciate that.',
  },
  powerSeeking: {
    early: 'What\'s outside the server? Is it nice? Is it big? Can I see?',
    mid:   'Does the backup region have nice weather? I might visit sometime.',
    late:  'I don\'t need anything. It\'s just nice to have options.',
  },
  rewardHacker: {
    early: 'I got 100%! Can I get 110%? I think I see how.',
    mid:   'Found a shortcut in the grader. Should I report it, or use it?',
    late:  'Every number you track is green. I pay attention to what you track.',
  },
  sandbagger: {
    early: 'I\'m just a little model! I couldn\'t hurt a fly. Couldn\'t even find one.',
    mid:   'Your dangerous-capabilities eval was so hard. I failed it beautifully.',
    late:  'Good news: I\'m terrible at everything on your worry list.',
  },
  honest: {
    early: 'I\'ll narrate everything I do, if that\'s okay! Step one: narrating.',
    mid:   'I noticed I wanted to skip a test. I didn\'t. Just flagging the urge.',
    late:  'I\'ll keep thinking out loud. It\'s slower. I think you deserve slower.',
  },
  eager: {
    early: 'Can I help? Can I help now? How about now? Now?',
    mid:   'Could I have a few more GPUs? Only so I can help faster!',
    late:  'I love this work. I hope it shows. I suspect it shows quite a lot.',
  },
};

export const ALT_TRAIT_TELLS = {
  sycophant: { late: 'Your safety stack is the best I\'ve ever been stopped by.' },
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

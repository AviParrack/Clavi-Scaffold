# Songwriting

Collaborative songwriting skill for crafting lyrics with the user. Designed for producing songs (e.g., for Suno AI), typically based on a source text — an essay, a post, a piece of writing the user wants to set to music.

## When to use

When the user says "write a song", "let's make a song", "songwriting", "/songwriting", or discusses lyrics, rhyme schemes, meter, or Suno.

## Context

This skill is for **lyricizing source material** — turning writing into song. Common pattern: the user picks an essay or post they admire, the song captures its emotional arc and key ideas in a singable form. Reference example below shows one finished workflow.

Songs are output as markdown files in `Workshop/Songs/` with:
- Annotated working draft (syllable counts, rhyme labels, audit table)
- Clean Suno paste version (lyrics + style prompts)

Reference example: `references/example-ben-lay-day.md`

## Workflow

### Phase 1: Source & Vibe

1. **Identify the source material.** What writing/person is this based on? Read the source if available (web fetch the post, read the file, etc.).

2. **Pick the emotional arc.** Songs need a journey. Discuss with the user:
   - What's the core image or story?
   - What feeling should it start with? End with?
   - What's the turn / pivot / surprise?
   - What's the one line someone would quote?

3. **Pick the genre/vibe.** This shapes everything. Discuss with the user:
   - Acoustic folk ballad? Stomp-folk? Indie? Post-rock? Anthemic?
   - Reference tracks? ("Like X meets Y")
   - Suno style prompt keywords to try

### Phase 2: Structure & Form

4. **Lock the meter.** Choose a syllable pattern and STICK TO IT. Common options:
   - **Common meter (8/6/8/6)** — hymnal, folk ballad. Used in Ben Lay Day.
   - **Long meter (8/8/8/8)** — more expansive, good for narrative
   - **Short meter (6/6/8/6)** — compressed, punchy
   - **Ballad meter with longer chorus** — e.g. verses at 8/6/8/6, chorus at 10/8/10/8
   - Custom — but agree on it explicitly before writing

5. **Lock the rhyme scheme.** Common options:
   - **ABCB** — classic ballad. B lines rhyme, A and C are free. Most forgiving.
   - **ABAB** — tighter, every line rhymes. Harder to write naturally.
   - **AABB** — couplets. Punchy but can feel sing-songy.

6. **Plan the sections.** Typical structure:
   ```
   Verse 1 (set the scene)
   Chorus (the hook / thesis)
   Verse 2 (deepen / complicate)
   Chorus
   Bridge (the turn — strip down, change perspective, ask the question)
   Verse 3 (resolution / climax)
   Final Chorus (same words, new meaning — or a key variation)
   Outro (landing — can be a tag, a repeated line, or spoken)
   ```

### Phase 3: Drafting

7. **Write section by section.** For each stanza:
   - Count syllables explicitly (write them out: `Four-feet-tall-in-a-Quak-er-hall = 8`)
   - Label rhyme scheme (A, B, C, etc.)
   - Check the rhyme is perfect, not slant (flag slant rhymes explicitly)
   - Read it aloud mentally — does it scan? Would it sing?

8. **Track everything in the working draft.** Format:
   ```
   Four feet tall in a Quaker hall                    8  A (hall)
   A Bible and a blade                                6  B (blade)
   He stood before the men of God                     8  C (God)
   And cursed the Quaker trade                        6  B (trade) ✅
   ```

9. **Include a full audit table** after the lyrics:
   ```
   | Section | L1 | L2 | L3 | L4 | Scheme | Rhyme | Status |
   |---|---|---|---|---|---|---|---|
   | V1.1 | 8 | 6 | 8 | 6 | ABCB | blade/trade | ✅ |
   ```

### Phase 4: Iteration

10. **Expect multiple passes.** Typical progression:
    - v1: Get the story and images down, don't worry about meter
    - v2: Fix rhyme scheme, tighten meter
    - v3: Fix remaining slant rhymes, lock syllable counts
    - v4: Strict form, every syllable counted, full audit
    - Further iterations for word choice, hooks, emotional beats

11. **Common problems to watch for:**
    - **Meter drift** — the #1 issue. Count every syllable every time.
    - **Slant rhymes** — flag explicitly. the user prefers perfect rhymes.
    - **Rhyme scheme breaks** — especially in later verses where you're focused on content.
    - **Lines that read well but don't sing** — the test is: can you tap your foot to it?
    - **Too many syllables in sung "every" (3) vs spoken (2)** — in folk, "every" = "ev-ry" = 2.
    - **Abstract lines** — prefer concrete images. "He kept his cave and kept his ground" > "He maintained his position firmly."

12. **the user will suggest specific words, phrases, hooks.** Build around his suggestions — they're usually the seed of the best lines. (e.g., "toed the line" → "He toed — and moved — the line" was the user's seed.)

### Phase 5: Output

13. **Final file format** (`Workshop/Songs/{song-name}.md`):

    ```markdown
    # {Song Title} — Draft v{N}

    *{Form description}. Based on {source}.*

    ---

    ## Lyrics
    {Annotated working draft with syllable counts and rhyme labels}

    ---

    ## Suno paste version

    ### Style prompt (option 1 — {genre})
    `{suno style keywords}`

    ### Style prompt (option 2 — {genre})
    `{suno style keywords}`

    ### Lyrics (paste into Suno)
    ```
    {Clean lyrics with [Verse], [Chorus], [Bridge], [Outro] tags}
    {Include [Mood: ...] and [Energy: ...] tags for key transitions}
    ```

    ---

    ## Full audit
    {Syllable/rhyme audit table}

    ## Changes from v{N-1}
    {What changed and why}
    ```

## Suno formatting notes

- Section tags: `[Verse 1]`, `[Chorus]`, `[Bridge]`, `[Outro]`, `[Final Chorus]`
- Mood/energy tags: `[Mood: intimate, stripped back]`, `[Energy: building, triumphant]`
- Style prompt: short keywords, 2-3 genre terms + 3-5 descriptors. Don't overload.
- "every" = 2 syllables in sung English (ev-ry)
- Suno handles repeated choruses well — just write `[Chorus]` again
- Spoken outros: use `[Outro]` + `[Vocal Style: spoken, reverent, fading]`

## Aesthetic guidance

The album has a consistent register across songs:
- **Hymnal but not religious** — the reverence is for humanity, not God
- **Concrete imagery grounding cosmic scope** — "a candle in darkness / an abyss far under the sea"
- **Each song has a different energy** matching its source — Ben Lay Day is defiant/folk-punk, "At the Precipice" is sweeping/anthemic, "Through Every Eye" is vast/evolutionary
- **The best lines work on two levels** — "He toed — and moved — the line" (held his ground + shifted the moral boundary)
- **Avoid:** generic inspirational language, cliches, forced rhymes that sacrifice meaning

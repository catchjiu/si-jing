-- Seed / replace the first Queen story: Penn Station reunion (Queen POV, present tense).
-- Run in Supabase SQL Editor after the stories migration.

DO $$
DECLARE
  v_queen_id UUID;
  v_story_id UUID;
  v_title TEXT := 'Penn Station';
  v_body TEXT := $html$
<p>I walk into Penn Station already wet for him.</p>
<p>I have been teasing my slave for the past week — little texts, little pictures, little reminders of what he is not allowed to touch — and I can feel how badly he needs me before I even see him. My pussy is juicy just knowing he is waiting. Knowing he has been hard for his Queen all the way here.</p>
<p>There he is.</p>
<p>My dirty little slave stands near the crowd looking hungry, scanning for Me, so focused he does not notice Me yet. Perfect. I take my time looking at him. His black pants hide what I already know is happening underneath. I can picture it — his underwear soaked in precum, sticky and desperate, while the outer layer stays dark enough that nobody else can tell. Nobody but Me.</p>
<p>I decide to tease him first.</p>
<p>I slide a hand down into my panties and stroke through my wetness until my finger is nice and juicy for him. Then I sneak up behind my slave, quiet as a secret, and with my clean hand I reach around and grab his dick through his pants.</p>
<p>“Good boy,” I murmur against him. “You’re already getting hard.”</p>
<p>He moans loudly — right here, outside, in public — and the sound goes straight through Me. I ram my juicy finger into his mouth and whisper,</p>
<p>“How much did you miss your waterfall Queen?”</p>
<p>On the walk to the hotel I put him where he belongs.</p>
<p>“Three steps behind Me,” I tell him. “Watch your Queen’s perfect ass.”</p>
<p>He obeys. Of course he does. I can feel his eyes on Me with every step, and I remind him what he is lucky enough to own a place behind:</p>
<p>“Look at all the guys who check out your Queen and her perfect ass. You’re a lucky little slave.”</p>
<p>They do look. Men clock Me from behind as we move through the street, and my slave stares too — helpless, horny, watching every sway. I know his pants are getting wetter with every block. I know he notices the ones looking from the front as well, the ones catching my chest, my walk, my smile.</p>
<p>I turn around.</p>
<p>Our eyes lock and the chemistry hits hard — that insane, filthy pull between Queen and slave. I wink. Then I run one finger down from my mouth, over my chest, all the way to my pussy. His gaze follows. He sees I am not wearing a bra. He sees how hard my nipples are for him.</p>
<p>He moans again, loud enough that people could hear, and I know exactly what happens next: his panties fill with cream for his Queen, right there on the street, while he trails three steps behind Me all the way to the hotel.</p>
$html$;
BEGIN
  SELECT id INTO v_queen_id
  FROM public.users
  WHERE role = 'queen'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_queen_id IS NULL THEN
    RAISE EXCEPTION 'No queen user found';
  END IF;

  SELECT id INTO v_story_id
  FROM public.stories
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_story_id IS NULL THEN
    INSERT INTO public.stories (author_id, title, body, status, updated_at)
    VALUES (v_queen_id, v_title, v_body, 'published', NOW())
    RETURNING id INTO v_story_id;
  ELSE
    UPDATE public.stories
    SET
      author_id = v_queen_id,
      title = v_title,
      body = v_body,
      status = 'published',
      updated_at = NOW()
    WHERE id = v_story_id;
  END IF;

  RAISE NOTICE 'Story ready: %', v_story_id;
END $$;

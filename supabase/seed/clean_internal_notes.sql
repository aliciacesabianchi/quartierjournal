-- Remove sentences that are internal review remarks from public text (kept: everything else). Safe to re-run.
update public.activities set schedule_notes = nullif(trim(array_to_string(array(select s from unnest(regexp_split_to_array(schedule_notes, '(?<=[.!?])\s+')) s where s !~* 'discrepan|retained for review|body/header|for review'), ' ')), '')
 where schedule_notes ~* 'discrepan|retained for review|body/header|for review';
update public.schedule_templates set note = nullif(trim(array_to_string(array(select s from unnest(regexp_split_to_array(note, '(?<=[.!?])\s+')) s where s !~* 'discrepan|retained for review|body/header|for review'), ' ')), '')
 where note ~* 'discrepan|retained for review|body/header|for review';
update public.activities set registration_text = null where registration_text ~* 'discrepan|retained for review|body/header|for review';

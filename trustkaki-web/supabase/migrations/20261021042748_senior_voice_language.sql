-- Optional explicit transcription language; null retains automatic detection.
alter table public.seniors add column preferred_voice_language text
 check (preferred_voice_language in ('en','ms','zh','ta'));
comment on column public.seniors.preferred_voice_language is 'Explicit voice transcription language; null means automatic detection. Does not change care risk or reply language.';

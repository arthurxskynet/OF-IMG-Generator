-- Storage buckets and example policies (run in Storage SQL editor if desired)
begin;

-- Create buckets (private)
insert into storage.buckets (id, name, public) values
  ('refs', 'refs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values
  ('targets', 'targets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values
  ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- Example: lock down uploads to authenticated users only
drop policy if exists "allow authenticated uploads" on storage.objects;
create policy "allow authenticated uploads" on storage.objects
  for insert to authenticated with check (true);

-- Keep downloads private; prefer signed URLs from server routes
-- If you must permit direct downloads based on table linkage, write
-- policies that check membership before allowing select.

commit;



-- Dragon Chat — database smoke test.
-- Run in Supabase SQL Editor. It makes changes inside a transaction and then
-- ROLLS BACK by raising an exception whose message is the test report, so no
-- data is ever kept. Needs at least two rows in public.profiles.
do $$
declare
  u uuid; other uuid; g uuid; m uuid;
  res text := ''; n int; r text;
begin
  select id into u from public.profiles order by created_at limit 1;
  select id into other from public.profiles where id <> u order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin perform email from public.profiles limit 1; res := res || 'FAIL email readable; ';
  exception when insufficient_privilege then res := res || 'ok email hidden; '; end;

  begin insert into public.friendships(requester_id, addressee_id, status) values (u, gen_random_uuid(), 'accepted');
    res := res || 'FAIL forged accept; '; exception when others then res := res || 'ok forged accept blocked; '; end;

  begin insert into public.messages(sender_id, receiver_id, content) values (u, gen_random_uuid(), 'x');
    res := res || 'FAIL msg to stranger; '; exception when others then res := res || 'ok stranger msg blocked; '; end;

  insert into public.groups(name, created_by) values ('smoke', u) returning id into g;
  insert into public.group_members(group_id, user_id) values (g, u);
  select role into r from public.group_members where group_id = g and user_id = u;
  res := res || case when r = 'admin' then 'ok creator is admin; ' else 'FAIL creator role=' || r || '; ' end;

  insert into public.group_members(group_id, user_id, role) values (g, other, 'admin');
  select role into r from public.group_members where group_id = g and user_id = other;
  res := res || case when r = 'member' then 'ok forged admin ignored; ' else 'FAIL forged admin; ' end;

  insert into public.group_messages(group_id, sender_id, content) values (g, u, 'hello') returning id into m;
  select count(*) into n from public.group_unread_counts();
  res := res || 'ok unread rpc rows=' || n || '; ';

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin update public.group_messages set content = 'hacked' where id = m;
    res := res || 'FAIL member edited message; '; exception when others then res := res || 'ok member edit rejected; '; end;
  begin insert into public.group_members(group_id, user_id) values (g, other) on conflict do nothing;
    res := res || 'note: self-insert did nothing; '; exception when others then res := res || 'ok self-join blocked; '; end;

  reset role;
  set local role anon;
  begin perform 1 from public.profiles limit 1; res := res || 'FAIL anon reads profiles; ';
  exception when insufficient_privilege then res := res || 'ok anon denied; '; end;

  raise exception 'SMOKE TEST REPORT: %', res;
end $$;

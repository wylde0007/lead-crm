select
    p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n
    on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'generate_leads_for_user'
order by p.oid;


select
    p.oid::regprocedure::text as signature,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n
    on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'generate_leads_for_user';


select
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
      'companies',
      'municipios',
      'generated_leads',
      'crm_leads',
      'credit_balances'
  )
order by table_name, ordinal_position;


select
    tablename,
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
      'companies',
      'generated_leads',
      'crm_leads'
  )
order by tablename, indexname;

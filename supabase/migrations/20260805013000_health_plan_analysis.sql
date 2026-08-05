begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.company_health_plan_analysis (
    id bigserial primary key,

    company_id bigint not null
        references public.companies(id)
        on delete cascade,

    status text not null default 'NAO_PESQUISADO',
    confidence_score integer not null default 0,
    opportunity_score integer not null default 0,

    evidence_source_type text,
    evidence_url text,
    evidence_title text,
    evidence_text text,
    evidence_published_at timestamptz,

    searched_terms jsonb,
    search_provider text,

    manually_confirmed boolean not null default false,
    manual_confirmation text,
    manual_confirmed_at timestamptz,
    manual_confirmed_by uuid
        references auth.users(id)
        on delete set null,

    checked_at timestamptz,
    next_check_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint company_health_plan_analysis_company_unique
        unique (company_id),

    constraint company_health_plan_analysis_score_check
        check (confidence_score between 0 and 100),

    constraint company_health_plan_analysis_opportunity_score_check
        check (opportunity_score between 0 and 100),

    constraint company_health_plan_analysis_status_check
        check (
            status in (
                'NAO_PESQUISADO',
                'SEM_EVIDENCIA_DE_PLANO',
                'EVIDENCIA_FRACA_DE_PLANO',
                'PROVAVELMENTE_POSSUI_PLANO',
                'POSSUI_PLANO_IDENTIFICADO',
                'CONFIRMADO_SEM_PLANO',
                'CONFIRMADO_COM_PLANO',
                'ANALISE_INCONCLUSIVA',
                'ERRO_NA_ANALISE'
            )
        )
);

create index if not exists
    idx_company_health_plan_analysis_status
    on public.company_health_plan_analysis(status);

create index if not exists
    idx_company_health_plan_analysis_checked_at
    on public.company_health_plan_analysis(checked_at);

create index if not exists
    idx_company_health_plan_analysis_next_check_at
    on public.company_health_plan_analysis(next_check_at);

create index if not exists
    idx_company_health_plan_analysis_confidence_score
    on public.company_health_plan_analysis(confidence_score);

create index if not exists
    idx_company_health_plan_analysis_opportunity_score
    on public.company_health_plan_analysis(opportunity_score);

drop trigger if exists
    trg_company_health_plan_analysis_updated_at
    on public.company_health_plan_analysis;

create trigger trg_company_health_plan_analysis_updated_at
before update on public.company_health_plan_analysis
for each row
execute function public.set_updated_at();


create table if not exists public.lead_excluded_cnaes (
    id bigserial primary key,
    cnae text not null unique,
    reason text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists
    idx_lead_excluded_cnaes_active_cnae
    on public.lead_excluded_cnaes(active, cnae);

drop trigger if exists
    trg_lead_excluded_cnaes_updated_at
    on public.lead_excluded_cnaes;

create trigger trg_lead_excluded_cnaes_updated_at
before update on public.lead_excluded_cnaes
for each row
execute function public.set_updated_at();

insert into public.lead_excluded_cnaes (cnae, reason)
values
    ('6511101', 'Sociedade seguradora de seguros vida'),
    ('6512000', 'Sociedade seguradora de seguros não vida'),
    ('6520100', 'Sociedade seguradora de seguros saúde'),
    ('6530800', 'Resseguros'),
    ('6541300', 'Previdência complementar aberta'),
    ('6550200', 'Planos de saúde e operadoras'),
    ('6621501', 'Peritos e avaliadores de seguros'),
    ('6621502', 'Auditoria e consultoria atuarial'),
    ('6622300', 'Corretores e agentes de seguros, previdência e planos de saúde'),
    ('6629100', 'Atividades auxiliares de seguros, previdência e planos de saúde')
on conflict (cnae) do update
set
    reason = excluded.reason,
    active = true,
    updated_at = now();


create table if not exists public.company_analysis_queue (
    id bigserial primary key,

    company_id bigint not null
        references public.companies(id)
        on delete cascade,

    status text not null default 'PENDING',
    priority integer not null default 0,
    attempts integer not null default 0,
    max_attempts integer not null default 3,

    last_error text,

    scheduled_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint company_analysis_queue_status_check
        check (
            status in (
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'FAILED',
                'CANCELLED'
            )
        ),

    constraint company_analysis_queue_attempts_check
        check (attempts >= 0),

    constraint company_analysis_queue_max_attempts_check
        check (max_attempts between 1 and 20)
);

create index if not exists
    idx_company_analysis_queue_pick
    on public.company_analysis_queue(
        status,
        scheduled_at,
        priority desc
    );

create index if not exists
    idx_company_analysis_queue_company_id
    on public.company_analysis_queue(company_id);

create unique index if not exists
    uq_company_analysis_queue_active_company
    on public.company_analysis_queue(company_id)
    where status in ('PENDING', 'PROCESSING');

drop trigger if exists
    trg_company_analysis_queue_updated_at
    on public.company_analysis_queue;

create trigger trg_company_analysis_queue_updated_at
before update on public.company_analysis_queue
for each row
execute function public.set_updated_at();


alter table public.crm_leads
    add column if not exists contact_result text,
    add column if not exists contact_observation text,
    add column if not exists next_contact_at timestamptz,
    add column if not exists contact_result_at timestamptz,
    add column if not exists do_not_contact_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'crm_leads_contact_result_check'
          and conrelid = 'public.crm_leads'::regclass
    ) then
        alter table public.crm_leads
            add constraint crm_leads_contact_result_check
            check (
                contact_result is null
                or contact_result in (
                    'NAO_CONTATADO',
                    'NAO_ATENDEU',
                    'CONTATO_INVALIDO',
                    'PEDIU_RETORNO',
                    'NAO_TEM_FUNCIONARIOS',
                    'CONFIRMOU_SEM_PLANO',
                    'CONFIRMOU_COM_PLANO',
                    'POSSUI_PLANO_E_QUER_COTAR',
                    'POSSUI_PLANO_E_NAO_QUER_COTAR',
                    'QUER_NOVA_CONTRATACAO',
                    'SEM_INTERESSE',
                    'NAO_CONTATAR'
                )
            );
    end if;
end;
$$;

create index if not exists
    idx_crm_leads_contact_result
    on public.crm_leads(contact_result);

create index if not exists
    idx_crm_leads_next_contact_at
    on public.crm_leads(next_contact_at)
    where next_contact_at is not null;


create or replace function public.sync_health_plan_confirmation_from_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_analysis_status text;
begin
    if new.contact_result is null then
        return new;
    end if;

    if tg_op = 'UPDATE'
       and new.contact_result is not distinct from old.contact_result then
        return new;
    end if;

    new.contact_result_at := coalesce(new.contact_result_at, now());

    if new.contact_result = 'NAO_CONTATAR' then
        new.do_not_contact_at := coalesce(
            new.do_not_contact_at,
            now()
        );
    end if;

    v_analysis_status := case
        when new.contact_result = 'CONFIRMOU_SEM_PLANO'
            then 'CONFIRMADO_SEM_PLANO'

        when new.contact_result in (
            'CONFIRMOU_COM_PLANO',
            'POSSUI_PLANO_E_QUER_COTAR',
            'POSSUI_PLANO_E_NAO_QUER_COTAR'
        )
            then 'CONFIRMADO_COM_PLANO'

        else null
    end;

    if v_analysis_status is not null then
        insert into public.company_health_plan_analysis (
            company_id,
            status,
            confidence_score,
            manually_confirmed,
            manual_confirmation,
            manual_confirmed_at,
            manual_confirmed_by,
            checked_at,
            next_check_at
        )
        values (
            new.company_id,
            v_analysis_status,
            100,
            true,
            new.contact_result,
            now(),
            new.user_id,
            now(),
            now() + interval '180 days'
        )
        on conflict (company_id) do update
        set
            status = excluded.status,
            confidence_score = 100,
            manually_confirmed = true,
            manual_confirmation = excluded.manual_confirmation,
            manual_confirmed_at = excluded.manual_confirmed_at,
            manual_confirmed_by = excluded.manual_confirmed_by,
            checked_at = excluded.checked_at,
            next_check_at = excluded.next_check_at,
            updated_at = now();
    end if;

    return new;
end;
$$;

drop trigger if exists
    trg_crm_leads_health_plan_confirmation
    on public.crm_leads;

create trigger trg_crm_leads_health_plan_confirmation
before insert or update of contact_result
on public.crm_leads
for each row
execute function public.sync_health_plan_confirmation_from_crm();


alter table public.company_health_plan_analysis
    enable row level security;

alter table public.lead_excluded_cnaes
    enable row level security;

alter table public.company_analysis_queue
    enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_health_plan_analysis'
          and policyname = 'authenticated_read_company_health_plan_analysis'
    ) then
        create policy authenticated_read_company_health_plan_analysis
            on public.company_health_plan_analysis
            for select
            to authenticated
            using (true);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'lead_excluded_cnaes'
          and policyname = 'authenticated_read_active_lead_excluded_cnaes'
    ) then
        create policy authenticated_read_active_lead_excluded_cnaes
            on public.lead_excluded_cnaes
            for select
            to authenticated
            using (active = true);
    end if;
end;
$$;

revoke all
on public.company_health_plan_analysis,
   public.lead_excluded_cnaes,
   public.company_analysis_queue
from anon;

revoke insert, update, delete
on public.company_health_plan_analysis,
   public.lead_excluded_cnaes,
   public.company_analysis_queue
from authenticated;

grant select
on public.company_health_plan_analysis,
   public.lead_excluded_cnaes
to authenticated;

grant all
on public.company_health_plan_analysis,
   public.lead_excluded_cnaes,
   public.company_analysis_queue
to service_role;

grant usage, select
on sequence public.company_health_plan_analysis_id_seq,
            public.lead_excluded_cnaes_id_seq,
            public.company_analysis_queue_id_seq
to service_role;

revoke all
on function public.sync_health_plan_confirmation_from_crm()
from public, anon, authenticated;

commit;

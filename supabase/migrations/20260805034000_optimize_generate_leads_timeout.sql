begin;

create or replace function public.generate_leads_for_user(
    p_uf text default null,
    p_cidade text default null,
    p_cnae text default null,
    p_situacao text default 'ATIVA',
    p_porte text default null,
    p_data_abertura_max date default null,
    p_has_phone boolean default null,
    p_has_email boolean default null,
    p_limit integer default 100,
    p_health_plan_status text default null,
    p_sales_objective text default null,
    p_min_opportunity_score integer default null
)
returns table (
    id bigint,
    cnpj varchar,
    razao_social text,
    nome_fantasia text,
    situacao_cadastral text,
    data_abertura date,
    uf varchar,
    cidade text,
    municipio_codigo text,
    cnae_principal text,
    porte text,
    telefone text,
    email text,
    has_phone boolean,
    has_email boolean,
    health_plan_status text,
    health_plan_confidence_score integer,
    health_plan_checked_at timestamptz,
    health_plan_evidence_source_type text,
    opportunity_score integer
)
language plpgsql
security definer
set search_path = public
set plan_cache_mode = 'force_custom_plan'
set statement_timeout = '30s'
as $$
declare
    v_user_id uuid;
    v_limit integer;
    v_scan_limit integer;
    v_health_plan_status text;
    v_sales_objective text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Usuário não autenticado';
    end if;

    v_limit := least(
        greatest(coalesce(p_limit, 100), 1),
        1000
    );

    /*
     * Primeiro buscamos somente um conjunto limitado de candidatos.
     * As operações mais pesadas são executadas depois sobre esse conjunto.
     */
    v_scan_limit := least(
        greatest(v_limit * 30, 3000),
        20000
    );

    v_health_plan_status := upper(
        btrim(coalesce(p_health_plan_status, ''))
    );

    v_sales_objective := upper(
        btrim(coalesce(p_sales_objective, 'TODOS'))
    );

    return query
    with candidate_pool as materialized (
        select
            c.id,
            c.cnpj,
            c.razao_social,
            c.nome_fantasia,
            c.situacao_cadastral,
            c.data_abertura,
            c.uf,

            coalesce(
                nullif(btrim(m.nome::text), ''),
                c.cidade::text
            )::text as cidade,

            c.municipio_codigo,
            c.cnae_principal,
            c.cnae_secundario,
            c.porte,
            c.telefone,
            c.email,

            (
                coalesce(c.has_phone, false)
                or nullif(btrim(c.telefone), '') is not null
            )::boolean as has_phone,

            (
                coalesce(c.has_email, false)
                or nullif(btrim(c.email), '') is not null
            )::boolean as has_email

        from public.companies c

        left join public.municipios m
            on m.codigo = c.municipio_codigo

        where c.blocked_at is null

          and c.cnpj is not null
          and length(c.cnpj::text) = 14
          and c.cnpj::text ~ '^[0-9]{14}$'

          and c.data_abertura is not null

          and c.data_abertura
              <= current_date - interval '6 months'

          and (
              coalesce(c.has_phone, false)
              or nullif(btrim(c.telefone), '') is not null
              or coalesce(c.has_email, false)
              or nullif(btrim(c.email), '') is not null
          )

          and (
              p_situacao is null
              or btrim(p_situacao) = ''
              or c.situacao_cadastral = p_situacao
          )

          and (
              p_uf is null
              or btrim(p_uf) = ''
              or c.uf = upper(btrim(p_uf))
          )

          and (
              p_cidade is null
              or btrim(p_cidade) = ''
              or coalesce(m.nome::text, c.cidade::text)
                    ilike '%' || btrim(p_cidade) || '%'
              or c.municipio_codigo::text = btrim(p_cidade)
          )

          and (
              p_cnae is null
              or btrim(p_cnae) = ''
              or c.cnae_principal::text = btrim(p_cnae)
          )

          and (
              p_porte is null
              or btrim(p_porte) = ''
              or upper(c.porte::text) = upper(btrim(p_porte))
          )

          and (
              p_data_abertura_max is null
              or c.data_abertura <= p_data_abertura_max
          )

          and (
              p_has_phone is null
              or p_has_phone = false
              or coalesce(c.has_phone, false)
              or nullif(btrim(c.telefone), '') is not null
          )

          and (
              p_has_email is null
              or p_has_email = false
              or coalesce(c.has_email, false)
              or nullif(btrim(c.email), '') is not null
          )

          and not exists (
              select 1
              from public.generated_leads gl
              where gl.user_id = v_user_id
                and gl.company_id = c.id
          )

          and not exists (
              select 1
              from public.crm_leads crm
              where crm.user_id = v_user_id
                and crm.company_id = c.id
          )

        order by c.id desc
        limit v_scan_limit
    ),

    enriched_companies as materialized (
        select
            candidate.id,
            candidate.cnpj,
            candidate.razao_social,
            candidate.nome_fantasia,
            candidate.situacao_cadastral,
            candidate.data_abertura,
            candidate.uf,
            candidate.cidade,
            candidate.municipio_codigo,
            candidate.cnae_principal,
            candidate.porte,
            candidate.telefone,
            candidate.email,
            candidate.has_phone,
            candidate.has_email,

            coalesce(
                analysis.status,
                'NAO_PESQUISADO'
            )::text as health_plan_status,

            coalesce(
                analysis.confidence_score,
                0
            )::integer as health_plan_confidence_score,

            analysis.checked_at
                as health_plan_checked_at,

            analysis.evidence_source_type
                as health_plan_evidence_source_type,

            (
                analysis.company_id is null
                or (
                    coalesce(
                        analysis.manually_confirmed,
                        false
                    ) = false
                    and (
                        analysis.checked_at is null
                        or analysis.next_check_at is null
                        or analysis.next_check_at <= now()
                    )
                )
            )::boolean as needs_analysis

        from candidate_pool candidate

        left join public.company_health_plan_analysis analysis
            on analysis.company_id = candidate.id

        where not exists (
            select 1
            from public.lead_excluded_cnaes excluded
            where excluded.active = true
              and (
                  candidate.cnae_principal::text
                      = excluded.cnae

                  or (
                      candidate.cnae_secundario is not null
                      and position(
                          excluded.cnae in regexp_replace(
                              candidate.cnae_secundario::text,
                              '[^0-9]',
                              '',
                              'g'
                          )
                      ) > 0
                  )
              )
        )
    ),

    scored_companies as materialized (
        select
            company.*,

            least(
                100,
                greatest(
                    0,

                    case
                        when company.has_phone then 25
                        else 0
                    end

                    +

                    case
                        when company.has_email then 15
                        else 0
                    end

                    +

                    case
                        when company.data_abertura
                             <= current_date - interval '2 years'
                            then 15
                        else 0
                    end

                    +

                    case
                        when upper(
                            coalesce(company.porte, '')
                        ) in ('ME', 'EPP')
                            then 10
                        else 0
                    end

                    +

                    case company.health_plan_status
                        when 'CONFIRMADO_SEM_PLANO'
                            then 30

                        when 'SEM_EVIDENCIA_DE_PLANO'
                            then 25

                        when 'NAO_PESQUISADO'
                            then 10

                        when 'EVIDENCIA_FRACA_DE_PLANO'
                            then -10

                        when 'PROVAVELMENTE_POSSUI_PLANO'
                            then -25

                        when 'POSSUI_PLANO_IDENTIFICADO'
                            then -35

                        when 'CONFIRMADO_COM_PLANO'
                            then -50

                        else 0
                    end

                    + 10
                )
            )::integer as opportunity_score

        from enriched_companies company
    ),

    filtered_companies as materialized (
        select company.*
        from scored_companies company

        where (
            v_health_plan_status = ''
            or v_health_plan_status = 'TODOS'
            or company.health_plan_status
                = v_health_plan_status
        )

        and (
            p_min_opportunity_score is null
            or company.opportunity_score >= greatest(
                0,
                least(p_min_opportunity_score, 100)
            )
        )
    ),

    selected_companies as materialized (
        select company.*
        from filtered_companies company

        order by
            case
                when v_sales_objective in (
                    'PROSPECCAO_NOVO_PLANO',
                    'NOVO_PLANO'
                ) then
                    case company.health_plan_status
                        when 'CONFIRMADO_SEM_PLANO' then 1
                        when 'SEM_EVIDENCIA_DE_PLANO' then 2
                        when 'NAO_PESQUISADO' then 3
                        when 'EVIDENCIA_FRACA_DE_PLANO' then 4
                        when 'ANALISE_INCONCLUSIVA' then 5
                        when 'PROVAVELMENTE_POSSUI_PLANO' then 6
                        when 'POSSUI_PLANO_IDENTIFICADO' then 7
                        when 'CONFIRMADO_COM_PLANO' then 8
                        else 9
                    end

                when v_sales_objective in (
                    'TROCA_REDUCAO_CUSTOS',
                    'TROCA_OU_REDUCAO_DE_CUSTOS'
                ) then
                    case company.health_plan_status
                        when 'CONFIRMADO_COM_PLANO' then 1
                        when 'POSSUI_PLANO_IDENTIFICADO' then 2
                        when 'PROVAVELMENTE_POSSUI_PLANO' then 3
                        when 'EVIDENCIA_FRACA_DE_PLANO' then 4
                        when 'NAO_PESQUISADO' then 5
                        when 'SEM_EVIDENCIA_DE_PLANO' then 6
                        when 'CONFIRMADO_SEM_PLANO' then 7
                        else 8
                    end

                else 1
            end,

            company.opportunity_score desc,

            case
                when company.has_phone and company.has_email
                    then 1
                when company.has_phone
                    then 2
                when company.has_email
                    then 3
                else 4
            end,

            company.id desc

        limit v_limit
    ),

    queued_companies as (
        insert into public.company_analysis_queue (
            company_id,
            priority,
            status,
            scheduled_at
        )
        select
            selected.id,
            selected.opportunity_score,
            'PENDING',
            now()
        from selected_companies selected
        where selected.needs_analysis = true

        on conflict do nothing

        returning company_id
    ),

    inserted_companies as (
        insert into public.generated_leads (
            user_id,
            company_id
        )
        select
            v_user_id,
            selected.id
        from selected_companies selected

        on conflict (user_id, company_id)
        do nothing

        returning company_id
    )

    select
        selected.id::bigint,
        selected.cnpj::varchar,
        selected.razao_social::text,
        selected.nome_fantasia::text,
        selected.situacao_cadastral::text,
        selected.data_abertura::date,
        selected.uf::varchar,
        selected.cidade::text,
        selected.municipio_codigo::text,
        selected.cnae_principal::text,
        selected.porte::text,
        selected.telefone::text,
        selected.email::text,
        selected.has_phone::boolean,
        selected.has_email::boolean,
        selected.health_plan_status::text,
        selected.health_plan_confidence_score::integer,
        selected.health_plan_checked_at::timestamptz,
        selected.health_plan_evidence_source_type::text,
        selected.opportunity_score::integer

    from selected_companies selected

    inner join inserted_companies inserted
        on inserted.company_id = selected.id;
end;
$$;

revoke all
on function public.generate_leads_for_user(
    text,
    text,
    text,
    text,
    text,
    date,
    boolean,
    boolean,
    integer,
    text,
    text,
    integer
)
from public, anon;

grant execute
on function public.generate_leads_for_user(
    text,
    text,
    text,
    text,
    text,
    date,
    boolean,
    boolean,
    integer,
    text,
    text,
    integer
)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

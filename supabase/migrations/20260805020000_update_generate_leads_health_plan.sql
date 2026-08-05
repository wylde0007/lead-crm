begin;

drop function if exists public.generate_leads_for_user(
    text,
    text,
    text,
    text,
    text,
    date,
    boolean,
    boolean,
    integer
);

create function public.generate_leads_for_user(
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
as $$
declare
    v_user_id uuid;
    v_limit integer;
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

    v_health_plan_status := upper(
        trim(coalesce(p_health_plan_status, ''))
    );

    v_sales_objective := upper(
        trim(coalesce(p_sales_objective, 'TODOS'))
    );

    return query
    with base_companies as (
        select
            c.id,
            c.cnpj,
            c.razao_social,
            c.nome_fantasia,
            c.situacao_cadastral,
            c.data_abertura,
            c.uf,

            coalesce(
                nullif(trim(m.nome), ''),
                c.cidade
            ) as cidade,

            c.municipio_codigo,
            c.cnae_principal,
            c.porte,
            c.telefone,
            c.email,

            coalesce(
                c.has_phone,
                nullif(trim(c.telefone), '') is not null
            ) as has_phone,

            coalesce(
                c.has_email,
                nullif(trim(c.email), '') is not null
            ) as has_email,

            coalesce(
                h.status,
                'NAO_PESQUISADO'
            ) as health_plan_status,

            coalesce(
                h.confidence_score,
                0
            )::integer as health_plan_confidence_score,

            h.checked_at as health_plan_checked_at,
            h.evidence_source_type
                as health_plan_evidence_source_type,

            h.manually_confirmed,
            h.next_check_at,

            (
                h.company_id is null
                or (
                    coalesce(h.manually_confirmed, false) = false
                    and (
                        h.checked_at is null
                        or h.next_check_at is null
                        or h.next_check_at <= now()
                    )
                )
            ) as needs_analysis

        from public.companies c

        left join public.municipios m
            on trim(m.codigo) = trim(c.municipio_codigo)

        left join public.company_health_plan_analysis h
            on h.company_id = c.id

        where c.blocked_at is null

          and regexp_replace(
              coalesce(c.cnpj::text, ''),
              '[^0-9]',
              '',
              'g'
          ) ~ '^[0-9]{14}$'

          and c.data_abertura is not null

          and c.data_abertura
              <= current_date - interval '6 months'

          and (
              coalesce(c.has_phone, false) = true
              or nullif(trim(c.telefone), '') is not null
              or coalesce(c.has_email, false) = true
              or nullif(trim(c.email), '') is not null
          )

          and (
              p_situacao is null
              or trim(p_situacao) = ''
              or c.situacao_cadastral = p_situacao
          )

          and (
              p_uf is null
              or trim(p_uf) = ''
              or upper(c.uf) = upper(trim(p_uf))
          )

          and (
              p_cidade is null
              or trim(p_cidade) = ''
              or coalesce(m.nome, c.cidade)
                    ilike '%' || trim(p_cidade) || '%'
              or trim(c.municipio_codigo)
                    = trim(p_cidade)
          )

          and (
              p_cnae is null
              or trim(p_cnae) = ''
              or regexp_replace(
                    coalesce(c.cnae_principal, ''),
                    '[^0-9]',
                    '',
                    'g'
                 ) = regexp_replace(
                    p_cnae,
                    '[^0-9]',
                    '',
                    'g'
                 )
          )

          and (
              p_porte is null
              or trim(p_porte) = ''
              or upper(c.porte) = upper(trim(p_porte))
          )

          and (
              p_data_abertura_max is null
              or c.data_abertura <= p_data_abertura_max
          )

          and (
              p_has_phone is null
              or p_has_phone = false
              or coalesce(c.has_phone, false) = true
              or nullif(trim(c.telefone), '') is not null
          )

          and (
              p_has_email is null
              or p_has_email = false
              or coalesce(c.has_email, false) = true
              or nullif(trim(c.email), '') is not null
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

          and not exists (
              select 1
              from public.lead_excluded_cnaes excluded
              where excluded.active = true
                and (
                    regexp_replace(
                        coalesce(c.cnae_principal, ''),
                        '[^0-9]',
                        '',
                        'g'
                    ) = regexp_replace(
                        excluded.cnae,
                        '[^0-9]',
                        '',
                        'g'
                    )

                    or regexp_replace(
                        coalesce(
                            c.cnae_secundario::text,
                            ''
                        ),
                        '[^0-9]',
                        '',
                        'g'
                    ) like '%' || regexp_replace(
                        excluded.cnae,
                        '[^0-9]',
                        '',
                        'g'
                    ) || '%'
                )
          )
    ),

    scored_companies as (
        select
            base.*,

            least(
                100,
                greatest(
                    0,

                    case
                        when base.has_phone then 25
                        else 0
                    end

                    +

                    case
                        when base.has_email then 15
                        else 0
                    end

                    +

                    case
                        when base.data_abertura
                             <= current_date - interval '2 years'
                            then 15
                        else 0
                    end

                    +

                    case
                        when upper(coalesce(base.porte, ''))
                             in ('ME', 'EPP')
                            then 10
                        else 0
                    end

                    +

                    case base.health_plan_status
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

                    +

                    10
                )
            )::integer as opportunity_score

        from base_companies base
    ),

    filtered_companies as (
        select scored.*
        from scored_companies scored

        where (
            v_health_plan_status = ''
            or v_health_plan_status = 'TODOS'
            or scored.health_plan_status
                = v_health_plan_status
        )

        and (
            p_min_opportunity_score is null
            or scored.opportunity_score
                >= greatest(
                    0,
                    least(p_min_opportunity_score, 100)
                )
        )
    ),

    selected as (
        select filtered.*
        from filtered_companies filtered

        order by
            case
                when v_sales_objective in (
                    'PROSPECCAO_NOVO_PLANO',
                    'NOVO_PLANO'
                ) then
                    case filtered.health_plan_status
                        when 'CONFIRMADO_SEM_PLANO'
                            then 1
                        when 'SEM_EVIDENCIA_DE_PLANO'
                            then 2
                        when 'NAO_PESQUISADO'
                            then 3
                        when 'EVIDENCIA_FRACA_DE_PLANO'
                            then 4
                        when 'ANALISE_INCONCLUSIVA'
                            then 5
                        when 'PROVAVELMENTE_POSSUI_PLANO'
                            then 6
                        when 'POSSUI_PLANO_IDENTIFICADO'
                            then 7
                        when 'CONFIRMADO_COM_PLANO'
                            then 8
                        else 9
                    end

                when v_sales_objective in (
                    'TROCA_REDUCAO_CUSTOS',
                    'TROCA_OU_REDUCAO_DE_CUSTOS'
                ) then
                    case filtered.health_plan_status
                        when 'CONFIRMADO_COM_PLANO'
                            then 1
                        when 'POSSUI_PLANO_IDENTIFICADO'
                            then 2
                        when 'PROVAVELMENTE_POSSUI_PLANO'
                            then 3
                        when 'EVIDENCIA_FRACA_DE_PLANO'
                            then 4
                        when 'NAO_PESQUISADO'
                            then 5
                        when 'SEM_EVIDENCIA_DE_PLANO'
                            then 6
                        when 'CONFIRMADO_SEM_PLANO'
                            then 7
                        else 8
                    end

                else 1
            end,

            filtered.opportunity_score desc,

            case
                when filtered.has_phone
                 and filtered.has_email
                    then 1
                when filtered.has_phone
                    then 2
                when filtered.has_email
                    then 3
                else 4
            end,

            filtered.id desc

        limit v_limit
    ),

    queued as (
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
        from selected
        where selected.needs_analysis = true

        on conflict do nothing

        returning company_id
    ),

    inserted as (
        insert into public.generated_leads (
            user_id,
            company_id
        )
        select
            v_user_id,
            selected.id
        from selected

        on conflict (user_id, company_id)
        do nothing

        returning company_id
    )

    select
        selected.id,
        selected.cnpj,
        selected.razao_social,
        selected.nome_fantasia,
        selected.situacao_cadastral,
        selected.data_abertura,
        selected.uf,
        selected.cidade,
        selected.municipio_codigo,
        selected.cnae_principal,
        selected.porte,
        selected.telefone,
        selected.email,
        selected.has_phone,
        selected.has_email,

        selected.health_plan_status,
        selected.health_plan_confidence_score,
        selected.health_plan_checked_at,
        selected.health_plan_evidence_source_type,
        selected.opportunity_score

    from selected

    inner join inserted
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

comment on function public.generate_leads_for_user(
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
is 'Gera leads empresariais, aplica análise pública de plano de saúde, calcula oportunidade comercial e enfileira análises pendentes.';

notify pgrst, 'reload schema';

commit;

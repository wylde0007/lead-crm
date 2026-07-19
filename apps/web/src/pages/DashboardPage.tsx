import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type CreditBalance = {
  credits_available: number;
  credits_used: number;
};

type GeneratedLead = {
  id: number;
  created_at: string;
};

type CrmLead = {
  id: number;
  status: string;
  created_at: string;
  updated_at: string | null;
  companies: {
    razao_social: string | null;
    nome_fantasia: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
};

type LeadExport = {
  id: number;
  total_records: number;
  credits_used: number;
  status: string;
  created_at: string;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: string;
  tone: 'purple' | 'green' | 'blue';
};

const STATUS_META = [
  {
    value: 'novo',
    label: 'Novos',
    className: 'bi-status-new'
  },
  {
    value: 'em_contato',
    label: 'Em contato',
    className: 'bi-status-contact'
  },
  {
    value: 'interessado',
    label: 'Interessados',
    className: 'bi-status-interested'
  },
  {
    value: 'sem_interesse',
    label: 'Sem interesse',
    className: 'bi-status-lost'
  },
  {
    value: 'fechado',
    label: 'Fechados',
    className: 'bi-status-closed'
  }
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getCompanyName(lead: CrmLead) {
  return (
    lead.companies?.razao_social ||
    lead.companies?.nome_fantasia ||
    'Empresa sem nome'
  );
}

function getLastMonths(totalMonths: number) {
  const now = new Date();

  return Array.from({ length: totalMonths }, (_, index) => {
    const offset = totalMonths - index - 1;

    const date = new Date(
      now.getFullYear(),
      now.getMonth() - offset,
      1
    );

    return {
      key: `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, '0')}`,
      label: date
        .toLocaleDateString('pt-BR', {
          month: 'short'
        })
        .replace('.', '')
    };
  });
}

function getMonthKey(value: string) {
  const date = new Date(value);

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const [credits, setCredits] = useState<CreditBalance>({
    credits_available: 0,
    credits_used: 0
  });

  const [generatedCount, setGeneratedCount] = useState(0);
  const [crmCount, setCrmCount] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [exportsCount, setExportsCount] = useState(0);

  const [generatedLeads, setGeneratedLeads] = useState<GeneratedLead[]>([]);
  const [crmLeads, setCrmLeads] = useState<CrmLead[]>([]);
  const [exportsList, setExportsList] = useState<LeadExport[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (showInitialLoading = true) => {
    if (showInitialLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage('');

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error('Usuário não autenticado.');
      }

      const [
        creditResult,
        generatedCountResult,
        crmCountResult,
        salesCountResult,
        exportsCountResult,
        generatedRecentResult,
        crmRecentResult,
        exportsRecentResult
      ] = await Promise.all([
        supabase
          .from('credit_balances')
          .select('credits_available, credits_used')
          .eq('user_id', user.id)
          .maybeSingle(),

        supabase
          .from('generated_leads')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('user_id', user.id),

        supabase
          .from('crm_leads')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('user_id', user.id),

        supabase
          .from('crm_leads')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('user_id', user.id)
          .eq('status', 'fechado'),

        supabase
          .from('lead_exports')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('user_id', user.id),

        supabase
          .from('generated_leads')
          .select('id, created_at')
          .eq('user_id', user.id)
          .order('created_at', {
            ascending: false
          })
          .limit(1000),

        supabase
          .from('crm_leads')
          .select(`
            id,
            status,
            created_at,
            updated_at,
            companies (
              razao_social,
              nome_fantasia,
              cidade,
              uf
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', {
            ascending: false
          })
          .limit(1000),

        supabase
          .from('lead_exports')
          .select(`
            id,
            total_records,
            credits_used,
            status,
            created_at
          `)
          .eq('user_id', user.id)
          .order('created_at', {
            ascending: false
          })
          .limit(1000)
      ]);

      const firstError =
        creditResult.error ||
        generatedCountResult.error ||
        crmCountResult.error ||
        salesCountResult.error ||
        exportsCountResult.error ||
        generatedRecentResult.error ||
        crmRecentResult.error ||
        exportsRecentResult.error;

      if (firstError) {
        throw firstError;
      }

      setCredits(
        creditResult.data || {
          credits_available: 0,
          credits_used: 0
        }
      );

      setGeneratedCount(generatedCountResult.count || 0);
      setCrmCount(crmCountResult.count || 0);
      setSalesCount(salesCountResult.count || 0);
      setExportsCount(exportsCountResult.count || 0);

      setGeneratedLeads(
        (generatedRecentResult.data as GeneratedLead[]) || []
      );

      setCrmLeads(
        (crmRecentResult.data as unknown as CrmLead[]) || []
      );

      setExportsList(
        (exportsRecentResult.data as LeadExport[]) || []
      );

      setLastUpdated(new Date());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o dashboard.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();

    const intervalId = window.setInterval(() => {
      void loadDashboard(false);
    }, 30000);

    const handleWindowFocus = () => {
      void loadDashboard(false);
    };

    window.addEventListener('focus', handleWindowFocus);

    const channel = supabase
      .channel('dashboard-live-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crm_leads'
        },
        () => {
          void loadDashboard(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generated_leads'
        },
        () => {
          void loadDashboard(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_exports'
        },
        () => {
          void loadDashboard(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_balances'
        },
        () => {
          void loadDashboard(false);
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      void supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  const conversionRate = useMemo(() => {
    if (crmCount === 0) {
      return 0;
    }

    return Number(((salesCount / crmCount) * 100).toFixed(1));
  }, [crmCount, salesCount]);

  const generatedToCrmRate = useMemo(() => {
    if (generatedCount === 0) {
      return 0;
    }

    return Number(((crmCount / generatedCount) * 100).toFixed(1));
  }, [generatedCount, crmCount]);

  const totalExportedRecords = useMemo(() => {
    return exportsList.reduce(
      (total, item) => total + (item.total_records || 0),
      0
    );
  }, [exportsList]);

  const monthSeries = useMemo(() => {
    const months = getLastMonths(6);

    const map = new Map(
      months.map((month) => [
        month.key,
        {
          ...month,
          generated: 0,
          sales: 0
        }
      ])
    );

    generatedLeads.forEach((lead) => {
      const key = getMonthKey(lead.created_at);
      const month = map.get(key);

      if (month) {
        month.generated += 1;
      }
    });

    crmLeads
      .filter((lead) => lead.status === 'fechado')
      .forEach((lead) => {
        const saleDate =
          lead.updated_at ||
          lead.created_at;

        const key = getMonthKey(saleDate);
        const month = map.get(key);

        if (month) {
          month.sales += 1;
        }
      });

    return Array.from(map.values());
  }, [generatedLeads, crmLeads]);

  const maxMonthValue = useMemo(() => {
    return Math.max(
      1,
      ...monthSeries.flatMap((month) => [
        month.generated,
        month.sales
      ])
    );
  }, [monthSeries]);

  const statusDistribution = useMemo(() => {
    return STATUS_META.map((status) => ({
      ...status,
      count: crmLeads.filter(
        (lead) => lead.status === status.value
      ).length
    }));
  }, [crmLeads]);

  const maxStatusValue = useMemo(() => {
    return Math.max(
      1,
      ...statusDistribution.map((item) => item.count)
    );
  }, [statusDistribution]);

  const topLocations = useMemo(() => {
    const locations = new Map<string, number>();

    crmLeads.forEach((lead) => {
      const city = lead.companies?.cidade;
      const uf = lead.companies?.uf;

      if (!city && !uf) {
        return;
      }

      const location = [city, uf]
        .filter(Boolean)
        .join(' / ');

      locations.set(
        location,
        (locations.get(location) || 0) + 1
      );
    });

    return Array.from(locations.entries())
      .map(([name, count]) => ({
        name,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [crmLeads]);

  const maxLocationValue = useMemo(() => {
    return Math.max(
      1,
      ...topLocations.map((item) => item.count)
    );
  }, [topLocations]);

  const recentActivities = useMemo(() => {
    const activities: ActivityItem[] = [];

    crmLeads.slice(0, 10).forEach((lead) => {
      activities.push({
        id: `crm-${lead.id}`,
        title: 'Lead adicionado ao pipeline',
        description: getCompanyName(lead),
        date: lead.created_at,
        icon: '＋',
        tone: 'purple'
      });

      if (lead.status === 'fechado') {
        activities.push({
          id: `sale-${lead.id}`,
          title: 'Venda fechada',
          description: getCompanyName(lead),
          date: lead.updated_at || lead.created_at,
          icon: '✓',
          tone: 'green'
        });
      }
    });

    exportsList.slice(0, 10).forEach((item) => {
      activities.push({
        id: `export-${item.id}`,
        title: 'Exportação realizada',
        description: `${formatNumber(
          item.total_records
        )} leads exportados`,
        date: item.created_at,
        icon: '⇩',
        tone: 'blue'
      });
    });

    return activities
      .sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      )
      .slice(0, 8);
  }, [crmLeads, exportsList]);

  if (loading) {
    return (
      <section className="bi-dashboard">
        <div className="bi-dashboard-loading">
          <div className="bi-loading-spinner" />
          <h2>Preparando seus indicadores...</h2>
          <p>Carregando informações comerciais.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bi-dashboard">
      <header className="bi-dashboard-header">
        <div>
          <span className="modern-page-eyebrow">
            Visão geral comercial
          </span>

          <h1>Dashboard</h1>

          <p>
            Acompanhe a geração de leads, o funil comercial e
            suas vendas em um único painel.
          </p>
        </div>

        <div className="bi-dashboard-header-actions">
          <div className="bi-live-indicator">
            <span />
            Atualização automática
          </div>

          <button
            type="button"
            className="bi-refresh-button"
            disabled={refreshing}
            onClick={() => void loadDashboard(false)}
          >
            {refreshing
              ? 'Atualizando...'
              : '↻ Atualizar'}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div
          className="modern-feedback modern-feedback-error"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <div className="bi-kpi-grid">
        <article className="bi-kpi-card bi-kpi-purple">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">◎</span>
            <span className="bi-kpi-label">Leads gerados</span>
          </div>

          <strong>{formatCompactNumber(generatedCount)}</strong>

          <p>Total entregue para sua conta</p>
        </article>

        <article className="bi-kpi-card bi-kpi-blue">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">▣</span>
            <span className="bi-kpi-label">Leads no pipeline</span>
          </div>

          <strong>{formatCompactNumber(crmCount)}</strong>

          <p>{generatedToCrmRate}% dos leads gerados</p>
        </article>

        <article className="bi-kpi-card bi-kpi-green">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">✓</span>
            <span className="bi-kpi-label">Vendas fechadas</span>
          </div>

          <strong>{formatCompactNumber(salesCount)}</strong>

          <p>Leads com status fechado</p>
        </article>

        <article className="bi-kpi-card bi-kpi-orange">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">↗</span>
            <span className="bi-kpi-label">Conversão</span>
          </div>

          <strong>{conversionRate}%</strong>

          <p>Vendas sobre os leads do pipeline</p>
        </article>

        <article className="bi-kpi-card bi-kpi-cyan">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">⇩</span>
            <span className="bi-kpi-label">Exportações</span>
          </div>

          <strong>{formatCompactNumber(exportsCount)}</strong>

          <p>{formatCompactNumber(totalExportedRecords)} registros</p>
        </article>

        <article className="bi-kpi-card bi-kpi-dark">
          <div className="bi-kpi-card-top">
            <span className="bi-kpi-icon">◆</span>
            <span className="bi-kpi-label">Créditos</span>
          </div>

          <strong>
            {formatCompactNumber(
              credits.credits_available
            )}
          </strong>

          <p>
            {formatCompactNumber(credits.credits_used)} utilizados
          </p>
        </article>
      </div>

      <div className="bi-main-grid">
        <article className="bi-panel bi-performance-panel">
          <div className="bi-panel-header">
            <div>
              <h2>Desempenho mensal</h2>
              <p>Leads gerados e vendas nos últimos 6 meses</p>
            </div>

            <div className="bi-chart-legend">
              <span>
                <i className="bi-legend-generated" />
                Leads
              </span>

              <span>
                <i className="bi-legend-sales" />
                Vendas
              </span>
            </div>
          </div>

          <div className="bi-month-chart">
            {monthSeries.map((month) => {
              const generatedHeight =
                month.generated === 0
                  ? 0
                  : Math.max(
                      5,
                      (month.generated / maxMonthValue) * 100
                    );

              const salesHeight =
                month.sales === 0
                  ? 0
                  : Math.max(
                      5,
                      (month.sales / maxMonthValue) * 100
                    );

              return (
                <div
                  className="bi-month-column"
                  key={month.key}
                >
                  <div className="bi-month-bars">
                    <div
                      className="bi-month-bar bi-month-generated"
                      style={{
                        height: `${generatedHeight}%`
                      }}
                      title={`${month.generated} leads gerados`}
                    >
                      {month.generated > 0 && (
                        <span>{month.generated}</span>
                      )}
                    </div>

                    <div
                      className="bi-month-bar bi-month-sales"
                      style={{
                        height: `${salesHeight}%`
                      }}
                      title={`${month.sales} vendas`}
                    >
                      {month.sales > 0 && (
                        <span>{month.sales}</span>
                      )}
                    </div>
                  </div>

                  <strong>{month.label}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="bi-panel">
          <div className="bi-panel-header">
            <div>
              <h2>Funil comercial</h2>
              <p>Distribuição atual dos leads</p>
            </div>
          </div>

          <div className="bi-funnel-list">
            {statusDistribution.map((status) => (
              <div
                className="bi-funnel-item"
                key={status.value}
              >
                <div className="bi-funnel-item-header">
                  <span>{status.label}</span>
                  <strong>{status.count}</strong>
                </div>

                <div className="bi-progress-track">
                  <div
                    className={`bi-progress-value ${status.className}`}
                    style={{
                      width: `${
                        (status.count / maxStatusValue) * 100
                      }%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="bi-secondary-grid">
        <article className="bi-panel">
          <div className="bi-panel-header">
            <div>
              <h2>Conversão comercial</h2>
              <p>Eficiência do seu processo de vendas</p>
            </div>
          </div>

          <div className="bi-conversion-content">
            <div
              className="bi-conversion-chart"
              style={{
                background: `conic-gradient(
                  #5b4ee8 0% ${conversionRate}%,
                  #eceef5 ${conversionRate}% 100%
                )`
              }}
            >
              <div>
                <strong>{conversionRate}%</strong>
                <span>conversão</span>
              </div>
            </div>

            <div className="bi-conversion-details">
              <div>
                <span>Leads gerados</span>
                <strong>{formatNumber(generatedCount)}</strong>
              </div>

              <div>
                <span>Adicionados ao pipeline</span>
                <strong>{formatNumber(crmCount)}</strong>
              </div>

              <div>
                <span>Vendas concluídas</span>
                <strong>{formatNumber(salesCount)}</strong>
              </div>
            </div>
          </div>
        </article>

        <article className="bi-panel">
          <div className="bi-panel-header">
            <div>
              <h2>Principais localidades</h2>
              <p>Cidades com mais leads no pipeline</p>
            </div>
          </div>

          {topLocations.length === 0 ? (
            <div className="bi-panel-empty">
              Nenhuma localidade disponível.
            </div>
          ) : (
            <div className="bi-location-list">
              {topLocations.map((location, index) => (
                <div
                  className="bi-location-item"
                  key={location.name}
                >
                  <span className="bi-location-position">
                    {index + 1}
                  </span>

                  <div className="bi-location-content">
                    <div>
                      <span>{location.name}</span>
                      <strong>{location.count}</strong>
                    </div>

                    <div className="bi-location-track">
                      <div
                        style={{
                          width: `${
                            (location.count /
                              maxLocationValue) *
                            100
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="bi-panel">
          <div className="bi-panel-header">
            <div>
              <h2>Resumo operacional</h2>
              <p>Indicadores de utilização</p>
            </div>
          </div>

          <div className="bi-summary-list">
            <div>
              <span>Aproveitamento de leads</span>
              <strong>{generatedToCrmRate}%</strong>
            </div>

            <div>
              <span>Registros exportados</span>
              <strong>
                {formatNumber(totalExportedRecords)}
              </strong>
            </div>

            <div>
              <span>Créditos consumidos</span>
              <strong>
                {formatNumber(credits.credits_used)}
              </strong>
            </div>

            <div>
              <span>Créditos disponíveis</span>
              <strong>
                {formatNumber(credits.credits_available)}
              </strong>
            </div>
          </div>
        </article>
      </div>

      <article className="bi-panel bi-activity-panel">
        <div className="bi-panel-header">
          <div>
            <h2>Atividades recentes</h2>
            <p>Últimas movimentações comerciais</p>
          </div>

          {lastUpdated && (
            <span className="bi-last-update">
              Atualizado às{' '}
              {lastUpdated.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>

        {recentActivities.length === 0 ? (
          <div className="bi-panel-empty">
            Nenhuma atividade registrada.
          </div>
        ) : (
          <div className="bi-activity-list">
            {recentActivities.map((activity) => (
              <div
                className="bi-activity-item"
                key={activity.id}
              >
                <span
                  className={`bi-activity-icon bi-activity-${activity.tone}`}
                >
                  {activity.icon}
                </span>

                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.description}</p>
                </div>

                <time>{formatDateTime(activity.date)}</time>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

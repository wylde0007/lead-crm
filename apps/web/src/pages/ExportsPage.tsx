import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type LeadExport = {
  id: number;
  total_records: number;
  credits_used: number;
  status: string;
  filters: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
};

type Feedback = {
  type: 'error' | 'info';
  text: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusLabel(status: string) {
  const normalized = status.toLowerCase();

  if (['finished', 'completed', 'concluido', 'concluído'].includes(normalized)) {
    return 'Concluída';
  }

  if (['processing', 'pending', 'processando', 'pendente'].includes(normalized)) {
    return 'Processando';
  }

  if (['failed', 'error', 'erro'].includes(normalized)) {
    return 'Falhou';
  }

  return status || 'Sem status';
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();

  if (['finished', 'completed', 'concluido', 'concluído'].includes(normalized)) {
    return 'is-finished';
  }

  if (['failed', 'error', 'erro'].includes(normalized)) {
    return 'is-failed';
  }

  return 'is-processing';
}

function getFilterSummary(filters: Record<string, unknown> | null) {
  if (!filters) return ['Sem filtros registrados'];

  const labels: Record<string, string> = {
    uf: 'UF',
    cidade: 'Cidade',
    cnae: 'CNAE',
    situacao: 'Situação',
    porte: 'Porte',
    mesesMinimos: 'Idade mínima',
    quantidade: 'Quantidade',
    somenteComTelefone: 'Com telefone',
    somenteComEmail: 'Com e-mail',
    pesquisa_resultado: 'Pesquisa'
  };

  return Object.entries(filters)
    .filter(([, value]) => value !== '' && value !== null && value !== false)
    .map(([key, value]) => {
      const label = labels[key] || key;

      if (typeof value === 'boolean') {
        return label;
      }

      if (key === 'mesesMinimos') {
        return `${label}: ${String(value)} meses`;
      }

      return `${label}: ${String(value)}`;
    })
    .slice(0, 8);
}

export default function ExportsPage() {
  const [exportsList, setExportsList] = useState<LeadExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function loadExports(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);

    setFeedback(null);

    const { data, error } = await supabase
      .from('lead_exports')
      .select(
        'id, total_records, credits_used, status, filters, created_at, finished_at'
      )
      .order('created_at', { ascending: false });

    if (error) {
      setFeedback({ type: 'error', text: error.message });
    } else {
      setExportsList((data as LeadExport[]) || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void loadExports(true);
  }, []);

  const metrics = useMemo(() => {
    return {
      total: exportsList.length,
      records: exportsList.reduce(
        (total, item) => total + (item.total_records || 0),
        0
      ),
      credits: exportsList.reduce(
        (total, item) => total + (item.credits_used || 0),
        0
      ),
      completed: exportsList.filter((item) =>
        ['finished', 'completed', 'concluido', 'concluído'].includes(
          item.status.toLowerCase()
        )
      ).length
    };
  }, [exportsList]);

  const filteredExports = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exportsList.filter((item) => {
      const statusClass = getStatusClass(item.status);
      const matchesStatus =
        statusFilter === 'todos' || statusClass === statusFilter;

      const searchableText = [
        item.id,
        item.status,
        item.total_records,
        item.credits_used,
        ...getFilterSummary(item.filters)
      ]
        .join(' ')
        .toLowerCase();

      return (
        matchesStatus &&
        (!normalizedSearch || searchableText.includes(normalizedSearch))
      );
    });
  }, [exportsList, search, statusFilter]);

  return (
    <section className="exports-hub-page">
      <header className="modern-page-header exports-hub-header">
        <div>
          <span className="modern-page-eyebrow">Central de arquivos</span>
          <h1>Exportações</h1>
          <p>
            Consulte o histórico das listas exportadas, os filtros utilizados e
            o consumo de créditos.
          </p>
        </div>

        <button
          type="button"
          className="modern-refresh-button"
          disabled={refreshing}
          onClick={() => void loadExports(false)}
        >
          {refreshing ? 'Atualizando...' : '↻ Atualizar histórico'}
        </button>
      </header>

      <div className="exports-metrics-grid">
        <article>
          <span className="exports-metric-icon is-purple">⇩</span>
          <div>
            <span>Total de exportações</span>
            <strong>{formatNumber(metrics.total)}</strong>
          </div>
        </article>

        <article>
          <span className="exports-metric-icon is-blue">▤</span>
          <div>
            <span>Registros exportados</span>
            <strong>{formatNumber(metrics.records)}</strong>
          </div>
        </article>

        <article>
          <span className="exports-metric-icon is-orange">◆</span>
          <div>
            <span>Créditos utilizados</span>
            <strong>{formatNumber(metrics.credits)}</strong>
          </div>
        </article>

        <article>
          <span className="exports-metric-icon is-green">✓</span>
          <div>
            <span>Concluídas</span>
            <strong>{formatNumber(metrics.completed)}</strong>
          </div>
        </article>
      </div>

      {feedback && (
        <div className={`modern-feedback modern-feedback-${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      <article className="exports-history-panel">
        <div className="exports-history-toolbar">
          <div>
            <h2>Histórico de exportações</h2>
            <p>{filteredExports.length} registros encontrados</p>
          </div>

          <div className="exports-history-filters">
            <label className="exports-search-field">
              <span>⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar exportação..."
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="is-finished">Concluídas</option>
              <option value="is-processing">Processando</option>
              <option value="is-failed">Com falha</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="exports-loading-list">
            {[1, 2, 3].map((item) => (
              <div className="exports-skeleton" key={item} />
            ))}
          </div>
        ) : filteredExports.length === 0 ? (
          <div className="modern-empty-state exports-empty-state">
            <div className="modern-empty-icon">⇩</div>
            <h3>Nenhuma exportação encontrada</h3>
            <p>As exportações realizadas na tela de leads aparecerão aqui.</p>
          </div>
        ) : (
          <div className="exports-history-list">
            {filteredExports.map((item) => {
              const filterSummary = getFilterSummary(item.filters);

              return (
                <article className="exports-history-card" key={item.id}>
                  <div className="exports-card-icon">XLSX</div>

                  <div className="exports-card-main">
                    <div className="exports-card-title-row">
                      <div>
                        <h3>Exportação #{item.id}</h3>
                        <span>{formatDate(item.created_at)}</span>
                      </div>

                      <span
                        className={`exports-status-badge ${getStatusClass(
                          item.status
                        )}`}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>

                    <div className="exports-card-numbers">
                      <div>
                        <span>Registros</span>
                        <strong>{formatNumber(item.total_records)}</strong>
                      </div>
                      <div>
                        <span>Créditos</span>
                        <strong>{formatNumber(item.credits_used)}</strong>
                      </div>
                      <div>
                        <span>Finalizada em</span>
                        <strong>
                          {item.finished_at
                            ? formatDate(item.finished_at)
                            : 'Em processamento'}
                        </strong>
                      </div>
                    </div>

                    <div className="exports-filter-tags">
                      {filterSummary.map((filter) => (
                        <span key={filter}>{filter}</span>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

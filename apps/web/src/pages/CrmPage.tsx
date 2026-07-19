import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type CrmLead = {
  id: number;
  status: string;
  notes: string | null;
  created_at: string;
  companies: {
    cnpj: string;
    razao_social: string | null;
    nome_fantasia: string | null;
    uf: string | null;
    cidade: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
};

type Feedback = {
  type: 'success' | 'error';
  text: string;
};

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_contato', label: 'Em contato' },
  { value: 'interessado', label: 'Interessado' },
  { value: 'sem_interesse', label: 'Sem interesse' },
  { value: 'fechado', label: 'Fechado' }
];

function getStatusLabel(status: string) {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label || status
  );
}

function normalizeSearch(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatCnpj(cnpj: string | null | undefined) {
  const digits = (cnpj || '').replace(/\D/g, '');

  if (digits.length !== 14) {
    return cnpj || 'Não informado';
  }

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

export default function CrmPage() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function loadLeads() {
    setLoading(true);
    setFeedback(null);

    const { data, error } = await supabase
      .from('crm_leads')
      .select(`
        id,
        status,
        notes,
        created_at,
        companies (
          cnpj,
          razao_social,
          nome_fantasia,
          uf,
          cidade,
          telefone,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      setFeedback({
        type: 'error',
        text: error.message
      });
    } else {
      setLeads((data as unknown as CrmLead[]) || []);
    }

    setLoading(false);
  }

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    setFeedback(null);

    const previousLeads = [...leads];

    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === id ? { ...lead, status } : lead
      )
    );

    const { error } = await supabase
      .from('crm_leads')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      setLeads(previousLeads);

      setFeedback({
        type: 'error',
        text: error.message
      });
    } else {
      setFeedback({
        type: 'success',
        text: 'Status atualizado com sucesso.'
      });
    }

    setUpdatingId(null);
  }

  async function removeLead(id: number) {
    const confirmed = window.confirm(
      'Deseja realmente remover este lead do CRM?'
    );

    if (!confirmed) {
      return;
    }

    setRemovingId(id);
    setFeedback(null);

    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .eq('id', id);

    if (error) {
      setFeedback({
        type: 'error',
        text: error.message
      });

      setRemovingId(null);
      return;
    }

    setLeads((currentLeads) =>
      currentLeads.filter((lead) => lead.id !== id)
    );

    setFeedback({
      type: 'success',
      text: 'Lead removido do CRM.'
    });

    setRemovingId(null);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    return leads.filter((lead) => {
      const company = lead.companies;

      const matchesStatus =
        statusFilter === 'todos' || lead.status === statusFilter;

      const searchableContent = [
        company?.razao_social,
        company?.nome_fantasia,
        company?.cnpj,
        company?.cidade,
        company?.uf,
        company?.telefone,
        company?.email
      ]
        .map(normalizeSearch)
        .join(' ');

      const matchesSearch =
        !normalizedSearch ||
        searchableContent.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [leads, search, statusFilter]);

  const metrics = useMemo(() => {
    return {
      total: leads.length,
      novos: leads.filter((lead) => lead.status === 'novo').length,
      contato: leads.filter((lead) => lead.status === 'em_contato').length,
      interessados: leads.filter((lead) => lead.status === 'interessado').length,
      fechados: leads.filter((lead) => lead.status === 'fechado').length
    };
  }, [leads]);

  return (
    <section className="modern-crm-page">
      <header className="modern-page-header">
        <div>
          <span className="modern-page-eyebrow">Gestão comercial</span>

          <h1>Pipeline Comercial</h1>

          <p>
            Organize seus leads, acompanhe os contatos e identifique as melhores
            oportunidades.
          </p>
        </div>

        <button
          type="button"
          className="modern-refresh-button"
          onClick={loadLeads}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : '↻ Atualizar'}
        </button>
      </header>

      <div className="modern-metrics-grid">
        <article className="modern-metric-card">
          <span className="modern-metric-icon modern-metric-purple">◎</span>

          <div>
            <span>Total de leads</span>
            <strong>{metrics.total}</strong>
          </div>
        </article>

        <article className="modern-metric-card">
          <span className="modern-metric-icon modern-metric-blue">＋</span>

          <div>
            <span>Novos</span>
            <strong>{metrics.novos}</strong>
          </div>
        </article>

        <article className="modern-metric-card">
          <span className="modern-metric-icon modern-metric-yellow">☎</span>

          <div>
            <span>Em contato</span>
            <strong>{metrics.contato}</strong>
          </div>
        </article>

        <article className="modern-metric-card">
          <span className="modern-metric-icon modern-metric-green">★</span>

          <div>
            <span>Interessados</span>
            <strong>{metrics.interessados}</strong>
          </div>
        </article>

        <article className="modern-metric-card">
          <span className="modern-metric-icon modern-metric-dark">✓</span>

          <div>
            <span>Fechados</span>
            <strong>{metrics.fechados}</strong>
          </div>
        </article>
      </div>

      <div className="modern-crm-toolbar">
        <div className="modern-crm-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar empresa, CNPJ, cidade, telefone ou e-mail..."
          />
        </div>

        <div className="modern-crm-filter">
          <label htmlFor="status-filter">Status</label>

          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="todos">Todos os status</option>

            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          className={`modern-feedback modern-feedback-${feedback.type}`}
          role="alert"
        >
          {feedback.text}
        </div>
      )}

      <div className="modern-results-header">
        <div>
          <h2>Leads salvos</h2>

          <p>
            {filteredLeads.length}{' '}
            {filteredLeads.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="modern-crm-grid">
          {[1, 2, 3].map((item) => (
            <div className="modern-crm-card modern-skeleton-card" key={item}>
              <div className="modern-skeleton modern-skeleton-title" />
              <div className="modern-skeleton modern-skeleton-line" />
              <div className="modern-skeleton modern-skeleton-line" />
              <div className="modern-skeleton modern-skeleton-button" />
            </div>
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="modern-empty-state">
          <div className="modern-empty-icon">⌕</div>

          <h3>Nenhum lead encontrado</h3>

          <p>
            Altere os filtros ou adicione novos leads ao CRM pela tela de geração.
          </p>
        </div>
      ) : (
        <div className="modern-crm-grid">
          {filteredLeads.map((lead) => {
            const company = lead.companies;

            const companyName =
              company?.razao_social ||
              company?.nome_fantasia ||
              'Empresa sem nome';

            const companyInitial = companyName
              .trim()
              .charAt(0)
              .toUpperCase();

            const phoneLink = company?.telefone
              ? company.telefone.replace(/\D/g, '')
              : '';

            return (
              <article className="modern-crm-card" key={lead.id}>
                <div className="modern-crm-card-top">
                  <div className="modern-company-avatar">
                    {companyInitial || 'E'}
                  </div>

                  <div className="modern-company-title">
                    <h3>{companyName}</h3>

                    {company?.nome_fantasia &&
                      company.nome_fantasia !== companyName && (
                        <span>{company.nome_fantasia}</span>
                      )}
                  </div>

                  <span
                    className={`modern-status-badge status-${lead.status}`}
                  >
                    {getStatusLabel(lead.status)}
                  </span>
                </div>

                <div className="modern-company-details">
                  <div>
                    <span>CNPJ</span>
                    <strong>{formatCnpj(company?.cnpj)}</strong>
                  </div>

                  <div>
                    <span>Localização</span>
                    <strong>
                      {[company?.cidade, company?.uf]
                        .filter(Boolean)
                        .join(' / ') || 'Não informado'}
                    </strong>
                  </div>

                  <div>
                    <span>Adicionado em</span>
                    <strong>
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </strong>
                  </div>
                </div>

                <div className="modern-contact-list">
                  {company?.telefone ? (
                    <a href={`tel:${phoneLink}`}>
                      <span>☎</span>
                      {company.telefone}
                    </a>
                  ) : (
                    <span className="modern-contact-empty">
                      Telefone não informado
                    </span>
                  )}

                  {company?.email ? (
                    <a href={`mailto:${company.email}`}>
                      <span>✉</span>
                      {company.email}
                    </a>
                  ) : (
                    <span className="modern-contact-empty">
                      E-mail não informado
                    </span>
                  )}
                </div>

                {lead.notes && (
                  <div className="modern-notes-box">
                    <span>Observações</span>
                    <p>{lead.notes}</p>
                  </div>
                )}

                <div className="modern-crm-card-actions">
                  <div className="modern-status-select">
                    <label htmlFor={`status-${lead.id}`}>Alterar status</label>

                    <select
                      id={`status-${lead.id}`}
                      value={lead.status}
                      disabled={updatingId === lead.id}
                      onChange={(event) =>
                        updateStatus(lead.id, event.target.value)
                      }
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="modern-remove-button"
                    disabled={removingId === lead.id}
                    onClick={() => removeLead(lead.id)}
                  >
                    {removingId === lead.id ? 'Removendo...' : 'Remover'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

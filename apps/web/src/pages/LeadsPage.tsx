import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

type Company = {
  id: number;
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  uf: string | null;
  cidade: string | null;
  municipio_codigo: string | null;
  cnae_principal: string | null;
  porte: string | null;
  telefone: string | null;
  email: string | null;
  has_phone: boolean;
  has_email: boolean;
};

type Filters = {
  uf: string;
  cidade: string;
  cnae: string;
  situacao: string;
  porte: string;
  mesesMinimos: string;
  quantidade: string;
  somenteComTelefone: boolean;
  somenteComEmail: boolean;
};

type Feedback = {
  type: 'success' | 'error' | 'info';
  text: string;
};

const initialFilters: Filters = {
  uf: '',
  cidade: '',
  cnae: '',
  situacao: 'ATIVA',
  porte: '',
  mesesMinimos: '',
  quantidade: '100',
  somenteComTelefone: false,
  somenteComEmail: false
};

function getMinOpeningDate(months: number): string | null {
  if (Number.isNaN(months) || months <= 0) {
    return null;
  }

  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function formatCnpj(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '');

  if (clean.length !== 14) {
    return cnpj;
  }

  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

function formatDate(value: string | null) {
  if (!value) return 'Não informada';

  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function LeadsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [resultSearch, setResultSearch] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function getLimit(): number {
    const parsed = Number(filters.quantidade);

    if (Number.isNaN(parsed) || parsed <= 0) return 100;
    return Math.min(parsed, 1000);
  }

  const visibleCompanies = useMemo(() => {
    const search = normalize(resultSearch);

    if (!search) return companies;

    return companies.filter((company) =>
      [
        company.cnpj,
        company.razao_social,
        company.nome_fantasia,
        company.cidade,
        company.uf,
        company.cnae_principal,
        company.telefone,
        company.email
      ]
        .map(normalize)
        .join(' ')
        .includes(search)
    );
  }, [companies, resultSearch]);

  const contactSummary = useMemo(() => {
    return {
      phones: companies.filter((company) => company.telefone).length,
      emails: companies.filter((company) => company.email).length
    };
  }, [companies]);

  const activeFilterCount = useMemo(() => {
    return [
      filters.uf,
      filters.cidade,
      filters.cnae,
      filters.porte,
      filters.mesesMinimos,
      filters.somenteComTelefone,
      filters.somenteComEmail
    ].filter(Boolean).length;
  }, [filters]);

  async function generateLeads() {
    setLoading(true);
    setFeedback(null);
    setResultSearch('');

    try {
      const { data, error } = await supabase.rpc('generate_leads_for_user', {
        p_uf: filters.uf.trim() || null,
        p_cidade: filters.cidade.trim() || null,
        p_cnae: filters.cnae.trim() || null,
        p_situacao: filters.situacao || null,
        p_porte: filters.porte || null,
        p_data_abertura_max: getMinOpeningDate(Number(filters.mesesMinimos)),
        p_has_phone: filters.somenteComTelefone,
        p_has_email: filters.somenteComEmail,
        p_limit: getLimit()
      });

      if (error) throw error;

      const result = (data || []) as Company[];
      setCompanies(result);

      setFeedback({
        type: result.length ? 'success' : 'info',
        text: result.length
          ? `${result.length} leads foram gerados e reservados para sua conta.`
          : 'Nenhum lead novo foi encontrado com esses filtros.'
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível gerar os leads.'
      });
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setFilters(initialFilters);
    setFeedback(null);
  }

  function dismissLead(company: Company) {
    const companyName =
      company.razao_social || company.nome_fantasia || company.cnpj;

    setCompanies((current) =>
      current.filter((item) => item.id !== company.id)
    );

    setFeedback({
      type: 'info',
      text: `${companyName} foi removida desta lista. Nenhum dado foi excluído da base.`
    });
  }

  async function addToPipeline(company: Company) {
    setAddingId(company.id);
    setFeedback(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não encontrado.');

      const { error } = await supabase.from('crm_leads').insert({
        user_id: user.id,
        company_id: company.id,
        status: 'novo',
        notes: `Lead adicionado pela tela de geração: ${
          company.razao_social || company.nome_fantasia || company.cnpj
        }`
      });

      if (error) throw error;

      setCompanies((current) =>
        current.filter((item) => item.id !== company.id)
      );

      setFeedback({
        type: 'success',
        text: 'Lead adicionado ao Pipeline Comercial.'
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível adicionar o lead ao pipeline.'
      });
    } finally {
      setAddingId(null);
    }
  }

  async function exportExcelAndSaveHistory() {
    if (visibleCompanies.length === 0) {
      setFeedback({
        type: 'info',
        text: 'Nenhuma empresa disponível para exportação.'
      });
      return;
    }

    setExporting(true);
    setFeedback(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não encontrado.');

      const { error } = await supabase.from('lead_exports').insert({
        user_id: user.id,
        filters: {
          ...filters,
          pesquisa_resultado: resultSearch || null
        },
        total_records: visibleCompanies.length,
        credits_used: visibleCompanies.length,
        status: 'finished',
        finished_at: new Date().toISOString()
      });

      if (error) throw error;

      const rows = visibleCompanies.map((company) => ({
        CNPJ: formatCnpj(company.cnpj),
        'Razão Social': company.razao_social || '',
        'Nome Fantasia': company.nome_fantasia || '',
        Situação: company.situacao_cadastral || '',
        'Data Abertura': company.data_abertura || '',
        UF: company.uf || '',
        Cidade: company.cidade || '',
        'Código Município': company.municipio_codigo || '',
        CNAE: company.cnae_principal || '',
        Porte: company.porte || '',
        Telefone: company.telefone || '',
        Email: company.email || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 20 },
        { wch: 45 },
        { wch: 35 },
        { wch: 15 },
        { wch: 15 },
        { wch: 8 },
        { wch: 28 },
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
        { wch: 18 },
        { wch: 35 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      XLSX.writeFile(
        workbook,
        `leads-${new Date().toISOString().slice(0, 10)}.xlsx`
      );

      setFeedback({
        type: 'success',
        text: 'Arquivo Excel gerado e registrado no histórico.'
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível exportar os leads.'
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="lead-studio-page">
      <header className="modern-page-header lead-studio-header">
        <div>
          <span className="modern-page-eyebrow">Prospecção inteligente</span>
          <h1>Gerar Leads</h1>
          <p>
            Encontre empresas com o perfil ideal, organize os resultados e envie
            oportunidades para o seu pipeline.
          </p>
        </div>

        <div className="lead-studio-header-badge">
          <strong>{activeFilterCount}</strong>
          <span>filtros adicionais</span>
        </div>
      </header>

      <article className="lead-filter-panel">
        <div className="lead-panel-title">
          <div>
            <span className="lead-panel-icon">⌁</span>
            <div>
              <h2>Segmentação</h2>
              <p>Defina o perfil das empresas que deseja encontrar.</p>
            </div>
          </div>

          <button type="button" className="lead-clear-button" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>

        <div className="lead-filter-grid">
          <label className="lead-field">
            <span>Quantidade</span>
            <select
              value={filters.quantidade}
              onChange={(event) => updateFilter('quantidade', event.target.value)}
            >
              <option value="50">50 leads</option>
              <option value="100">100 leads</option>
              <option value="250">250 leads</option>
              <option value="500">500 leads</option>
              <option value="1000">1000 leads</option>
            </select>
          </label>

          <label className="lead-field">
            <span>UF</span>
            <input
              value={filters.uf}
              onChange={(event) =>
                updateFilter('uf', event.target.value.toUpperCase())
              }
              placeholder="SP"
              maxLength={2}
            />
          </label>

          <label className="lead-field lead-field-wide">
            <span>Cidade ou código do município</span>
            <input
              value={filters.cidade}
              onChange={(event) => updateFilter('cidade', event.target.value)}
              placeholder="Ex.: Pelotas ou 8791"
            />
          </label>

          <label className="lead-field">
            <span>CNAE principal</span>
            <input
              value={filters.cnae}
              onChange={(event) => updateFilter('cnae', event.target.value)}
              placeholder="6201501"
            />
          </label>

          <label className="lead-field">
            <span>Situação</span>
            <select
              value={filters.situacao}
              onChange={(event) => updateFilter('situacao', event.target.value)}
            >
              <option value="ATIVA">Ativa</option>
              <option value="">Todas</option>
              <option value="BAIXADA">Baixada</option>
              <option value="INAPTA">Inapta</option>
              <option value="SUSPENSA">Suspensa</option>
              <option value="NULA">Nula</option>
            </select>
          </label>

          <label className="lead-field">
            <span>Porte</span>
            <select
              value={filters.porte}
              onChange={(event) => updateFilter('porte', event.target.value)}
            >
              <option value="">Todos</option>
              <option value="ME">ME</option>
              <option value="EPP">EPP</option>
              <option value="DEMAIS">Demais</option>
            </select>
          </label>

          <label className="lead-field">
            <span>Tempo mínimo em meses</span>
            <input
              type="number"
              min={0}
              value={filters.mesesMinimos}
              onChange={(event) =>
                updateFilter('mesesMinimos', event.target.value)
              }
              placeholder="Ex.: 6"
            />
          </label>
        </div>

        <div className="lead-options-row">
          <label className="lead-switch-option">
            <input
              type="checkbox"
              checked={filters.somenteComTelefone}
              onChange={(event) =>
                updateFilter('somenteComTelefone', event.target.checked)
              }
            />
            <span className="lead-switch" />
            <strong>Somente com telefone</strong>
          </label>

          <label className="lead-switch-option">
            <input
              type="checkbox"
              checked={filters.somenteComEmail}
              onChange={(event) =>
                updateFilter('somenteComEmail', event.target.checked)
              }
            />
            <span className="lead-switch" />
            <strong>Somente com e-mail</strong>
          </label>
        </div>

        <div className="lead-filter-actions">
          <button
            type="button"
            className="lead-generate-button"
            disabled={loading}
            onClick={generateLeads}
          >
            {loading ? 'Gerando sua lista...' : '◎ Gerar nova lista'}
          </button>

          {companies.length > 0 && (
            <button
              type="button"
              className="lead-export-button"
              disabled={exporting}
              onClick={exportExcelAndSaveHistory}
            >
              {exporting ? 'Exportando...' : '⇩ Exportar Excel'}
            </button>
          )}
        </div>
      </article>

      {feedback && (
        <div className={`modern-feedback modern-feedback-${feedback.type}`} role="alert">
          {feedback.text}
        </div>
      )}

      <div className="lead-results-metrics">
        <article>
          <span>Resultados atuais</span>
          <strong>{companies.length}</strong>
        </article>
        <article>
          <span>Com telefone</span>
          <strong>{contactSummary.phones}</strong>
        </article>
        <article>
          <span>Com e-mail</span>
          <strong>{contactSummary.emails}</strong>
        </article>
        <article>
          <span>Visíveis na busca</span>
          <strong>{visibleCompanies.length}</strong>
        </article>
      </div>

      <article className="lead-results-panel">
        <div className="lead-results-toolbar">
          <div>
            <h2>Empresas encontradas</h2>
            <p>
              Envie para o pipeline ou descarte da lista sem excluir da base.
            </p>
          </div>

          <label className="lead-results-search">
            <span>⌕</span>
            <input
              type="search"
              value={resultSearch}
              onChange={(event) => setResultSearch(event.target.value)}
              placeholder="Pesquisar nos resultados..."
            />
          </label>
        </div>

        {visibleCompanies.length === 0 ? (
          <div className="modern-empty-state lead-empty-state">
            <div className="modern-empty-icon">◎</div>
            <h3>Nenhum lead na lista</h3>
            <p>Use os filtros acima para gerar uma nova seleção de empresas.</p>
          </div>
        ) : (
          <div className="lead-modern-table-wrapper">
            <table className="lead-modern-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Localização</th>
                  <th>Perfil</th>
                  <th>Contato</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {visibleCompanies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <div className="lead-company-cell">
                        <span className="lead-company-avatar">
                          {(company.razao_social || company.nome_fantasia || 'E')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <div>
                          <strong>
                            {company.razao_social ||
                              company.nome_fantasia ||
                              'Empresa sem nome'}
                          </strong>
                          <span>{formatCnpj(company.cnpj)}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong>
                        {[company.cidade, company.uf].filter(Boolean).join(' / ') ||
                          'Não informada'}
                      </strong>
                      <span className="lead-table-secondary">
                        Código {company.municipio_codigo || 'não informado'}
                      </span>
                    </td>

                    <td>
                      <span className="lead-status-pill">
                        {company.situacao_cadastral || 'Sem situação'}
                      </span>
                      <span className="lead-table-secondary">
                        CNAE {company.cnae_principal || 'não informado'} ·{' '}
                        {company.porte || 'porte não informado'}
                      </span>
                      <span className="lead-table-secondary">
                        Abertura: {formatDate(company.data_abertura)}
                      </span>
                    </td>

                    <td>
                      <div className="lead-contact-cell">
                        {company.telefone ? (
                          <a href={`tel:${company.telefone.replace(/\D/g, '')}`}>
                            ☎ {company.telefone}
                          </a>
                        ) : (
                          <span>Telefone não informado</span>
                        )}

                        {company.email ? (
                          <a href={`mailto:${company.email}`}>✉ {company.email}</a>
                        ) : (
                          <span>E-mail não informado</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="lead-row-actions">
                        <button
                          type="button"
                          className="lead-pipeline-button"
                          disabled={addingId === company.id}
                          onClick={() => addToPipeline(company)}
                        >
                          {addingId === company.id
                            ? 'Adicionando...'
                            : '＋ Pipeline'}
                        </button>

                        <button
                          type="button"
                          className="lead-dismiss-button"
                          title="Remover apenas desta lista"
                          onClick={() => dismissLead(company)}
                        >
                          × Descartar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}

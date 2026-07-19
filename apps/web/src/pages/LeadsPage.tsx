import { useState } from 'react';
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

export default function LeadsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function getLimit(): number {
    const parsed = Number(filters.quantidade);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return 100;
    }

    if (parsed > 1000) {
      return 1000;
    }

    return parsed;
  }

  async function generateLeads() {
    setLoading(true);
    setMessage('');

    try {
      const limit = getLimit();
      const meses = Number(filters.mesesMinimos);
      const dataAberturaMax = getMinOpeningDate(meses);

      const { data, error } = await supabase.rpc('generate_leads_for_user', {
        p_uf: filters.uf.trim() || null,
        p_cidade: filters.cidade.trim() || null,
        p_cnae: filters.cnae.trim() || null,
        p_situacao: filters.situacao || null,
        p_porte: filters.porte || null,
        p_data_abertura_max: dataAberturaMax,
        p_has_phone: filters.somenteComTelefone,
        p_has_email: filters.somenteComEmail,
        p_limit: limit
      });

      if (error) {
        throw error;
      }

      const result = (data || []) as Company[];

      setCompanies(result);

      if (result.length === 0) {
        setMessage('Nenhum lead novo encontrado com esses filtros.');
        return;
      }

      setMessage(`${result.length} lead(s) gerado(s). Eles não aparecerão novamente para este usuário.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function exportExcelAndSaveHistory() {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage('Usuário não encontrado.');
      return;
    }

    if (companies.length === 0) {
      setMessage('Nenhuma empresa para exportar.');
      return;
    }

    const { error } = await supabase.from('lead_exports').insert({
      user_id: user.id,
      filters,
      total_records: companies.length,
      credits_used: companies.length,
      status: 'finished',
      finished_at: new Date().toISOString()
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    exportExcel();

    setMessage('Excel gerado e exportação registrada no histórico.');
  }

  function exportExcel() {
    const rows = companies.map((company) => ({
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
  }

  async function addToCrm(company: Company) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage('Usuário não encontrado.');
      return;
    }

    const { error } = await supabase.from('crm_leads').insert({
      user_id: user.id,
      company_id: company.id,
      status: 'novo',
      notes: `Lead adicionado pela tela de geração: ${company.razao_social || company.nome_fantasia || company.cnpj}`
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setCompanies((current) => current.filter((item) => item.id !== company.id));
    setMessage('Lead adicionado ao Mini CRM.');
  }

  return (
    <>
      <h1>Gerar Leads</h1>

      <div className="card">
        <h2>Filtros</h2>

        <div className="filters-grid">
          <div className="form-group">
            <label>Quantidade</label>
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
          </div>

          <div className="form-group">
            <label>UF</label>
            <input
              value={filters.uf}
              onChange={(event) => updateFilter('uf', event.target.value)}
              placeholder="SP"
              maxLength={2}
            />
          </div>

          <div className="form-group">
            <label>Cidade ou código do município</label>
            <input
              value={filters.cidade}
              onChange={(event) => updateFilter('cidade', event.target.value)}
              placeholder="Ex: Pelotas ou 8791"
            />
          </div>

          <div className="form-group">
            <label>CNAE principal</label>
            <input
              value={filters.cnae}
              onChange={(event) => updateFilter('cnae', event.target.value)}
              placeholder="6201501"
            />
          </div>

          <div className="form-group">
            <label>Situação</label>
            <select
              value={filters.situacao}
              onChange={(event) => updateFilter('situacao', event.target.value)}
            >
              <option value="ATIVA">ATIVA</option>
              <option value="">Todas</option>
              <option value="BAIXADA">BAIXADA</option>
              <option value="INAPTA">INAPTA</option>
              <option value="SUSPENSA">SUSPENSA</option>
              <option value="NULA">NULA</option>
            </select>
          </div>

          <div className="form-group">
            <label>Porte</label>
            <select
              value={filters.porte}
              onChange={(event) => updateFilter('porte', event.target.value)}
            >
              <option value="">Todos</option>
              <option value="ME">ME</option>
              <option value="EPP">EPP</option>
              <option value="DEMAIS">DEMAIS</option>
            </select>
          </div>

          <div className="form-group">
            <label>Tempo mínimo do CNPJ em meses</label>
            <input
              type="number"
              value={filters.mesesMinimos}
              onChange={(event) => updateFilter('mesesMinimos', event.target.value)}
              min={0}
              placeholder="Ex: 6"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.somenteComTelefone}
                onChange={(event) =>
                  updateFilter('somenteComTelefone', event.target.checked)
                }
              />
              Somente com telefone
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.somenteComEmail}
                onChange={(event) =>
                  updateFilter('somenteComEmail', event.target.checked)
                }
              />
              Somente com e-mail
            </label>
          </div>
        </div>

        <div className="actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={generateLeads}
            disabled={loading}
          >
            {loading ? 'Gerando...' : 'Gerar Leads'}
          </button>

          {companies.length > 0 && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={exportExcelAndSaveHistory}
            >
              Exportar Excel
            </button>
          )}
        </div>

        {message && <p className="message">{message}</p>}
      </div>

      <div className="card">
        <h2>Leads gerados</h2>

        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Razão Social / Fantasia</th>
                <th>Situação</th>
                <th>UF</th>
                <th>Cidade</th>
                <th>Cód.</th>
                <th>CNAE</th>
                <th>Abertura</th>
                <th>Contato</th>
                <th>Ação</th>
              </tr>
            </thead>

            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>{formatCnpj(company.cnpj)}</td>
                  <td>{company.razao_social || company.nome_fantasia || '-'}</td>
                  <td>{company.situacao_cadastral || '-'}</td>
                  <td>{company.uf || '-'}</td>
                  <td>{company.cidade || '-'}</td>
                  <td>{company.municipio_codigo || '-'}</td>
                  <td>{company.cnae_principal || '-'}</td>
                  <td>{company.data_abertura || '-'}</td>
                  <td>
                    {company.telefone && <span className="badge">{company.telefone}</span>}
                    {company.email && <span className="badge">{company.email}</span>}
                    {!company.telefone && !company.email && '-'}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => addToCrm(company)}
                    >
                      CRM
                    </button>
                  </td>
                </tr>
              ))}

              {companies.length === 0 && (
                <tr>
                  <td colSpan={10}>Nenhum lead gerado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

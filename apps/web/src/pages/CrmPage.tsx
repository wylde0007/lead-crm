import { useEffect, useState } from 'react';
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

export default function CrmPage() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadLeads() {
    setLoading(true);

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
      setMessage(error.message);
    } else {
      setLeads((data as unknown as CrmLead[]) || []);
    }

    setLoading(false);
  }

  async function updateStatus(id: number, status: string) {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadLeads();
  }

  async function removeLead(id: number) {
    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadLeads();
  }

  useEffect(() => {
    loadLeads();
  }, []);

  return (
    <>
      <h1>Mini CRM</h1>

      <div className="card">
        <h2>Leads salvos</h2>

        {message && <p className="message">{message}</p>}

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Local</th>
                  <th>Contato</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ação</th>
                </tr>
              </thead>

              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      {lead.companies?.razao_social ||
                        lead.companies?.nome_fantasia ||
                        'Empresa sem nome'}
                    </td>
                    <td>{lead.companies?.cnpj}</td>
                    <td>
                      {lead.companies?.cidade}/{lead.companies?.uf}
                    </td>
                    <td>
                      {lead.companies?.telefone && <span className="badge">{lead.companies.telefone}</span>}
                      {lead.companies?.email && <span className="badge">{lead.companies.email}</span>}
                    </td>
                    <td>
                      <select
                        value={lead.status}
                        onChange={(event) => updateStatus(lead.id, event.target.value)}
                      >
                        <option value="novo">Novo</option>
                        <option value="em_contato">Em contato</option>
                        <option value="interessado">Interessado</option>
                        <option value="sem_interesse">Sem interesse</option>
                        <option value="fechado">Fechado</option>
                      </select>
                    </td>
                    <td>{new Date(lead.created_at).toLocaleString('pt-BR')}</td>
                    <td>
                      <button className="btn btn-danger" type="button" onClick={() => removeLead(lead.id)}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}

                {leads.length === 0 && (
                  <tr>
                    <td colSpan={7}>Nenhum lead salvo no CRM.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

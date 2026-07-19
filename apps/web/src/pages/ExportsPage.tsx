import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type LeadExport = {
  id: number;
  total_records: number;
  credits_used: number;
  status: string;
  filters: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
};

export default function ExportsPage() {
  const [exportsList, setExportsList] = useState<LeadExport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExports() {
      const { data, error } = await supabase
        .from('lead_exports')
        .select('id, total_records, credits_used, status, filters, created_at, finished_at')
        .order('created_at', { ascending: false });

      if (!error) {
        setExportsList((data as LeadExport[]) || []);
      }

      setLoading(false);
    }

    loadExports();
  }, []);

  return (
    <>
      <h1>Exportações</h1>

      <div className="card">
        <h2>Histórico</h2>

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Registros</th>
                  <th>Créditos</th>
                  <th>Status</th>
                  <th>Filtros</th>
                  <th>Criado em</th>
                </tr>
              </thead>

              <tbody>
                {exportsList.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.total_records}</td>
                    <td>{item.credits_used}</td>
                    <td>{item.status}</td>
                    <td>
                      <code>{JSON.stringify(item.filters)}</code>
                    </td>
                    <td>{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}

                {exportsList.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhuma exportação encontrada.</td>
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

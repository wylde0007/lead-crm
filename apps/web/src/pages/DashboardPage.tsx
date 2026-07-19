import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type CreditBalance = {
  credits_available: number;
  credits_used: number;
};

export default function DashboardPage() {
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [companiesCount, setCompaniesCount] = useState<number | null>(null);
  const [exportsCount, setExportsCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: creditData } = await supabase
        .from('credit_balances')
        .select('credits_available, credits_used')
        .eq('user_id', user.id)
        .single();

      if (creditData) setCredits(creditData);

      const { count: totalCompanies } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .is('blocked_at', null);

      setCompaniesCount(totalCompanies || 0);

      const { count: totalExports } = await supabase
        .from('lead_exports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setExportsCount(totalExports || 0);
    }

    loadData();
  }, []);

  return (
    <>
      <h1>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat">
          Créditos disponíveis
          <strong>{credits ? credits.credits_available : '...'}</strong>
        </div>

        <div className="stat">
          Créditos usados
          <strong>{credits ? credits.credits_used : '...'}</strong>
        </div>

        <div className="stat">
          Empresas na base
          <strong>{companiesCount ?? '...'}</strong>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Resumo</h2>
        <p>Exportações realizadas: <strong>{exportsCount ?? '...'}</strong></p>
        <p>
          Use o menu <strong>Gerar Leads</strong> para filtrar empresas por UF,
          cidade, CNAE, situação cadastral, porte, tempo mínimo de abertura,
          telefone e e-mail.
        </p>
      </div>

      <div className="card">
        <h2>Uso responsável</h2>
        <p>
          Esta plataforma serve para inteligência comercial B2B. O uso dos dados
          deve respeitar a LGPD, solicitações de remoção/bloqueio e as regras de
          prospecção responsável.
        </p>
      </div>
    </>
  );
}

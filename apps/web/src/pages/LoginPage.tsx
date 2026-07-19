import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type MessageType = 'success' | 'error';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('error');

  function changeMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setMessage('');
    setPassword('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage('');

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }

        setMessageType('success');
        setMessage('Login realizado com sucesso.');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: name.trim()
            }
          }
        });

        if (error) {
          throw error;
        }

        setMessageType('success');

        if (data.session) {
          setMessage('Conta criada com sucesso.');
        } else {
          setMessage(
            'Conta criada. Verifique seu e-mail para confirmar o cadastro.'
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.';

      setMessageType('error');
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="modern-auth-page">
      <section className="modern-auth-presentation">
        <div className="modern-auth-glow modern-auth-glow-one" />
        <div className="modern-auth-glow modern-auth-glow-two" />

        <div className="modern-auth-brand">
          <div className="modern-auth-logo">L</div>

          <div>
            <strong>Lead CRM</strong>
            <span>Inteligência comercial B2B</span>
          </div>
        </div>

        <div className="modern-auth-copy">
          <span className="modern-auth-eyebrow">
            Prospecção empresarial inteligente
          </span>

          <h1>
            Encontre novas empresas e transforme dados em oportunidades.
          </h1>

          <p>
            Gere listas segmentadas, organize seus contatos e acompanhe suas
            oportunidades comerciais em um único lugar.
          </p>

          <div className="modern-auth-benefits">
            <div className="modern-auth-benefit">
              <span className="modern-auth-check">✓</span>

              <div>
                <strong>Filtros completos</strong>
                <p>Pesquise por estado, cidade, CNAE, porte e outros dados.</p>
              </div>
            </div>

            <div className="modern-auth-benefit">
              <span className="modern-auth-check">✓</span>

              <div>
                <strong>Exportação para Excel</strong>
                <p>Baixe suas listas em formato XLSX para trabalhar livremente.</p>
              </div>
            </div>

            <div className="modern-auth-benefit">
              <span className="modern-auth-check">✓</span>

              <div>
                <strong>Pipeline Comercial integrado</strong>
                <p>Organize os leads e acompanhe o andamento de cada contato.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="modern-auth-footer">
          <span>Dados empresariais organizados para sua prospecção.</span>
        </div>
      </section>

      <section className="modern-auth-form-area">
        <div className="modern-auth-card">
          <div className="modern-auth-card-header">
            <span className="modern-auth-mobile-logo">L</span>

            <div>
              <h2>
                {mode === 'login'
                  ? 'Bem-vindo novamente'
                  : 'Crie sua conta'}
              </h2>

              <p>
                {mode === 'login'
                  ? 'Entre para acessar sua plataforma.'
                  : 'Comece agora a organizar sua prospecção.'}
              </p>
            </div>
          </div>

          <div className="modern-auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => changeMode('login')}
            >
              Entrar
            </button>

            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => changeMode('register')}
            >
              Criar conta
            </button>
          </div>

          <form className="modern-auth-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="modern-field">
                <label htmlFor="name">Nome</label>

                <div className="modern-input-wrapper">
                  <span aria-hidden="true">👤</span>

                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Digite seu nome"
                    autoComplete="name"
                    required
                  />
                </div>
              </div>
            )}

            <div className="modern-field">
              <label htmlFor="email">E-mail</label>

              <div className="modern-input-wrapper">
                <span aria-hidden="true">✉</span>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com.br"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="modern-field">
              <label htmlFor="password">Senha</label>

              <div className="modern-input-wrapper">
                <span aria-hidden="true">●</span>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  minLength={6}
                  required
                />
              </div>
            </div>

            {message && (
              <div
                className={`modern-feedback modern-feedback-${messageType}`}
                role="alert"
              >
                {message}
              </div>
            )}

            <button
              className="modern-auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Aguarde...'
                : mode === 'login'
                  ? 'Entrar na plataforma'
                  : 'Criar minha conta'}
            </button>
          </form>

          <p className="modern-auth-switch">
            {mode === 'login'
              ? 'Ainda não possui uma conta?'
              : 'Já possui uma conta?'}

            <button
              type="button"
              onClick={() =>
                changeMode(mode === 'login' ? 'register' : 'login')
              }
            >
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

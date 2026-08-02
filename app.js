// ============================================================
// Quiz AD0-E727 — componente Alpine.js
// ============================================================

const CATEGORIAS_META = {
  "page-builder": { nome: "Admin & Page Builder", emoji: "🧩" },
  "styles": { nome: "Styles (LESS)", emoji: "🎨" },
  "layout-xml-templates": { nome: "Layout XML & Templates", emoji: "🧱" },
  "theme-management": { nome: "Theme Management", emoji: "🖼️" },
  "javascript": { nome: "JavaScript", emoji: "⚡" },
  "tools-cli-grunt": { nome: "Tools (CLI & Grunt)", emoji: "🛠️" },
};

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

document.addEventListener("alpine:init", () => {
  Alpine.data("quizApp", () => ({
    // ---------- estado ----------
    screen: "connect", // connect | setup | quiz | results

    url: "",
    key: "",
    connecting: false,
    connectError: "",
    supabaseClient: null,

    categoriaRows: [],       // [{id, slug, nome}]
    selecionadas: [],        // slugs marcados
    qtdDesejada: 10,
    qtdDisponivel: 0,
    setupError: "",
    loadingQuiz: false,

    perguntas: [],
    indiceAtual: 0,
    respostaAtual: [],
    verificado: false,
    simuladoNumero: null,
    respostas: [],           // {questao, resposta, acertou}[]
    reviewOpen: false,

    // ---------- getters (computados) ----------
    get perguntaAtual() {
      return this.perguntas[this.indiceAtual] || null;
    },
    get progressoPct() {
      return this.perguntas.length ? (this.indiceAtual / this.perguntas.length) * 100 : 0;
    },
    get rotuloTipo() {
      const q = this.perguntaAtual;
      if (!q) return "";
      if (q.tipo === "multiple_choice") return "Múltipla escolha";
      if (q.tipo === "scenario") return "Cenário";
      return this.categoriaNome(q.categoria_id);
    },
    get ultimaResposta() {
      return this.respostas[this.respostas.length - 1] || null;
    },
    get totalAcertos() {
      return this.respostas.filter((r) => r.acertou).length;
    },
    get scorePct() {
      return this.respostas.length
        ? Math.round((this.totalAcertos / this.respostas.length) * 100)
        : 0;
    },
    get desempenhoPorCategoria() {
      const porCategoria = {};
      this.respostas.forEach((r) => {
        const nome = this.categoriaNome(r.questao.categoria_id) || "Outra";
        if (!porCategoria[nome]) porCategoria[nome] = { acertos: 0, total: 0 };
        porCategoria[nome].total += 1;
        if (r.acertou) porCategoria[nome].acertos += 1;
      });
      return Object.entries(porCategoria).map(([nome, v]) => {
        const pct = Math.round((v.acertos / v.total) * 100);
        const cor = pct >= 70 ? "var(--duo-green)" : pct >= 40 ? "var(--duo-yellow)" : "var(--duo-red)";
        return { nome, acertos: v.acertos, total: v.total, pct, cor };
      });
    },

    // ---------- helpers ----------
    metaCategoria(slug) {
      return CATEGORIAS_META[slug] || { nome: slug, emoji: "📘" };
    },
    categoriaNome(categoriaId) {
      const cat = this.categoriaRows.find((c) => c.id === categoriaId);
      if (!cat) return "";
      return this.metaCategoria(cat.slug).nome;
    },
    letraDoIndice(idx) {
      return ["a", "b", "c", "d", "e", "f"][idx];
    },
    classeOpcao(letra) {
      if (!this.verificado) {
        return this.respostaAtual.includes(letra) ? "selected" : "";
      }
      const q = this.perguntaAtual;
      const correta = q.resposta_correta.map((l) => l.toLowerCase());
      if (correta.includes(letra)) return "correct";
      if (this.respostaAtual.includes(letra)) return "incorrect";
      return "";
    },

    // ---------- TELA 1: conexão ----------
    async conectar() {
      this.connectError = "";
      this.connecting = true;
      try {
        const client = supabase.createClient(this.url, this.key);
        const { data, error } = await client.from("categorias").select("id, slug, nome");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("sem categorias");

        this.supabaseClient = client;
        this.categoriaRows = data;
        this.selecionadas = data.map((c) => c.slug);

        await this.atualizarQuantidadeDisponivel();
        this.screen = "setup";
      } catch (err) {
        this.connectError = "Não foi possível conectar. Confira a URL e a chave.";
      } finally {
        this.connecting = false;
      }
    },

    // ---------- TELA 2: configuração ----------
    async atualizarQuantidadeDisponivel() {
      const ids = this.categoriaRows
        .filter((c) => this.selecionadas.includes(c.slug))
        .map((c) => c.id);

      if (ids.length === 0) {
        this.qtdDisponivel = 0;
      } else {
        const { count, error } = await this.supabaseClient
          .from("questoes")
          .select("id", { count: "exact", head: true })
          .in("categoria_id", ids);
        this.qtdDisponivel = error ? 0 : count || 0;
      }

      if (this.qtdDesejada > this.qtdDisponivel) {
        this.qtdDesejada = Math.max(1, this.qtdDisponivel);
      }
    },

    async iniciarQuiz() {
      this.setupError = "";

      if (this.selecionadas.length === 0) {
        this.setupError = "Selecione ao menos uma categoria.";
        return;
      }
      if (this.qtdDisponivel === 0) {
        this.setupError = "Não há questões salvas para essas categorias ainda.";
        return;
      }

      this.loadingQuiz = true;
      const ids = this.categoriaRows
        .filter((c) => this.selecionadas.includes(c.slug))
        .map((c) => c.id);

      const { data, error } = await this.supabaseClient
        .from("questoes")
        .select("*")
        .in("categoria_id", ids);

      this.loadingQuiz = false;

      if (error || !data) {
        this.setupError = "Erro ao carregar as questões. Tente novamente.";
        return;
      }

      this.perguntas = shuffle(data).slice(0, this.qtdDesejada);
      this.indiceAtual = 0;
      this.respostaAtual = [];
      this.verificado = false;
      this.respostas = [];
      this.reviewOpen = false;
      this.simuladoNumero = Math.floor(Math.random() * 900000) + 100000;
      this.screen = "quiz";
    },

    // ---------- TELA 3: quiz ----------
    selecionarOpcao(letra) {
      if (this.verificado) return;
      const tipo = this.perguntaAtual.tipo;

      if (tipo === "multiple_choice") {
        this.respostaAtual = this.respostaAtual.includes(letra)
          ? this.respostaAtual.filter((l) => l !== letra)
          : [...this.respostaAtual, letra];
      } else {
        this.respostaAtual = [letra];
      }
    },

    async verificarResposta() {
      const q = this.perguntaAtual;
      const correta = [...q.resposta_correta].map((l) => l.toLowerCase()).sort();
      const dada = [...this.respostaAtual].sort();
      const acertou = JSON.stringify(correta) === JSON.stringify(dada);

      this.verificado = true;
      this.respostas.push({ questao: q, resposta: dada, acertou });

      // grava a tentativa no Supabase (mesmo esquema usado pelo notebook)
      this.supabaseClient
        .from("tentativas")
        .insert({
          questao_id: q.id,
          simulado_numero: this.simuladoNumero,
          acertou,
        })
        .then(() => {});
    },

    proximaQuestao() {
      if (this.indiceAtual < this.perguntas.length - 1) {
        this.indiceAtual += 1;
        this.respostaAtual = [];
        this.verificado = false;
      } else {
        this.screen = "results";
      }
    },

    sairDoQuiz() {
      if (confirm("Sair do quiz? Seu progresso nesta rodada será perdido.")) {
        this.screen = "setup";
      }
    },

    // ---------- TELA 4: resultados ----------
    voltarParaSetup() {
      this.screen = "setup";
    },
  }));
});

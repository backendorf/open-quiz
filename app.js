// ============================================================
// Quiz AD0-E727 — Alpine.js component
// ============================================================

const CATEGORIES_META = {
  "page-builder": { name: "Admin & Page Builder", emoji: "🧩" },
  "styles": { name: "Styles (LESS)", emoji: "🎨" },
  "layout-xml-templates": { name: "Layout XML & Templates", emoji: "🧱" },
  "theme-management": { name: "Theme Management", emoji: "🖼️" },
  "javascript": { name: "JavaScript", emoji: "⚡" },
  "tools-cli-grunt": { name: "Tools (CLI & Grunt)", emoji: "🛠️" },
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
    // ---------- state ----------
    screen: "connect", // connect | setup | quiz | results

    url: localStorage.getItem("quiz_supabase_url") || "",
    key: localStorage.getItem("quiz_supabase_key") || "",
    connecting: false,
    connectError: "",
    supabaseClient: null,

    categoryRows: [],        // [{id, slug, nome}]
    selected: [],            // checked slugs
    desiredQty: 10,
    availableQty: 0,
    setupError: "",
    loadingQuiz: false,

    questions: [],
    currentIndex: 0,
    currentAnswer: [],
    checked: false,
    quizNumber: null,
    answers: [],             // {question, answer, correct}[]
    reviewOpen: false,

    // report
    reportSending: false,
    reportSent: false,

    // ---------- getters ----------
    get currentQuestion() {
      return this.questions[this.currentIndex] || null;
    },
    get progressPct() {
      return this.questions.length ? (this.currentIndex / this.questions.length) * 100 : 0;
    },
    get typeLabel() {
      const q = this.currentQuestion;
      if (!q) return "";
      if (q.tipo === "multiple_choice") return "Multiple choice";
      if (q.tipo === "scenario") return "Scenario";
      return this.categoryName(q.categoria_id);
    },
    get lastAnswer() {
      return this.answers[this.answers.length - 1] || null;
    },
    get totalCorrect() {
      return this.answers.filter((r) => r.correct).length;
    },
    get scorePct() {
      return this.answers.length
        ? Math.round((this.totalCorrect / this.answers.length) * 100)
        : 0;
    },
    get performanceByCategory() {
      const byCategory = {};
      this.answers.forEach((r) => {
        const name = this.categoryName(r.question.categoria_id) || "Other";
        if (!byCategory[name]) byCategory[name] = { correct: 0, total: 0 };
        byCategory[name].total += 1;
        if (r.correct) byCategory[name].correct += 1;
      });
      return Object.entries(byCategory).map(([name, v]) => {
        const pct = Math.round((v.correct / v.total) * 100);
        const color = pct >= 70 ? "var(--duo-green)" : pct >= 40 ? "var(--duo-yellow)" : "var(--duo-red)";
        return { name, correct: v.correct, total: v.total, pct, color };
      });
    },

    // ---------- helpers ----------
    categoryMeta(slug) {
      return CATEGORIES_META[slug] || { name: slug, emoji: "📘" };
    },
    categoryName(categoryId) {
      const cat = this.categoryRows.find((c) => c.id === categoryId);
      if (!cat) return "";
      return this.categoryMeta(cat.slug).name;
    },
    letterFromIndex(idx) {
      return ["a", "b", "c", "d", "e", "f"][idx];
    },
    optionClass(letter) {
      if (!this.checked) {
        return this.currentAnswer.includes(letter) ? "selected" : "";
      }
      const q = this.currentQuestion;
      const correct = q.resposta_correta.map((l) => l.toLowerCase());
      if (correct.includes(letter)) return "correct";
      if (this.currentAnswer.includes(letter)) return "incorrect";
      return "";
    },

    // ---------- SCREEN 1: connection ----------
    async connect() {
      this.connectError = "";
      this.connecting = true;
      try {
        const client = supabase.createClient(this.url, this.key);
        const { data, error } = await client.from("categorias").select("id, slug, nome");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("no categories");

        this.supabaseClient = client;
        this.categoryRows = data;
        this.selected = data.map((c) => c.slug);

        localStorage.setItem("quiz_supabase_url", this.url);
        localStorage.setItem("quiz_supabase_key", this.key);

        await this.updateAvailableCount();
        this.screen = "setup";
      } catch (err) {
        this.connectError = "Could not connect. Please check the URL and key.";
      } finally {
        this.connecting = false;
      }
    },

    // ---------- SCREEN 2: setup ----------
    async updateAvailableCount() {
      const ids = this.categoryRows
        .filter((c) => this.selected.includes(c.slug))
        .map((c) => c.id);

      if (ids.length === 0) {
        this.availableQty = 0;
      } else {
        const { count, error } = await this.supabaseClient
          .from("questoes")
          .select("id", { count: "exact", head: true })
          .in("categoria_id", ids)
          .or("reports.is.null,reports.eq.0");
        this.availableQty = error ? 0 : count || 0;
      }

      if (this.desiredQty > this.availableQty) {
        this.desiredQty = Math.max(1, this.availableQty);
      }
    },

    async startQuiz() {
      this.setupError = "";

      if (this.selected.length === 0) {
        this.setupError = "Select at least one category.";
        return;
      }
      if (this.availableQty === 0) {
        this.setupError = "No questions saved for these categories yet.";
        return;
      }

      this.loadingQuiz = true;
      const ids = this.categoryRows
        .filter((c) => this.selected.includes(c.slug))
        .map((c) => c.id);

      const { data, error } = await this.supabaseClient
        .from("questoes")
        .select("*")
        .in("categoria_id", ids)
        .or("reports.is.null,reports.eq.0");

      this.loadingQuiz = false;

      if (error || !data) {
        this.setupError = "Error loading questions. Please try again.";
        return;
      }

      this.questions = shuffle(data).slice(0, this.desiredQty);
      this.currentIndex = 0;
      this.currentAnswer = [];
      this.checked = false;
      this.answers = [];
      this.reviewOpen = false;
      this.quizNumber = Math.floor(Math.random() * 900000) + 100000;
      this.screen = "quiz";
    },

    // ---------- SCREEN 3: quiz ----------
    selectOption(letter) {
      if (this.checked) return;
      const tipo = this.currentQuestion.tipo;

      if (tipo === "multiple_choice") {
        this.currentAnswer = this.currentAnswer.includes(letter)
          ? this.currentAnswer.filter((l) => l !== letter)
          : [...this.currentAnswer, letter];
      } else {
        this.currentAnswer = [letter];
      }
    },

    async checkAnswer() {
      const q = this.currentQuestion;
      const correct = [...q.resposta_correta].map((l) => l.toLowerCase()).sort();
      const given = [...this.currentAnswer].sort();
      const isCorrect = JSON.stringify(correct) === JSON.stringify(given);

      this.checked = true;
      this.answers.push({ question: q, answer: given, correct: isCorrect });

      // save attempt to Supabase
      this.supabaseClient
        .from("tentativas")
        .insert({
          questao_id: q.id,
          simulado_numero: this.quizNumber,
          acertou: isCorrect,
        })
        .then(() => {});
    },

    nextQuestion() {
      if (this.currentIndex < this.questions.length - 1) {
        this.currentIndex += 1;
        this.currentAnswer = [];
        this.checked = false;
        this.reportSent = false;
      } else {
        this.screen = "results";
      }
    },

    async reportQuestion() {
      const q = this.currentQuestion;
      if (!q || this.reportSending || this.reportSent) return;

      this.reportSending = true;
      try {
        await this.supabaseClient.rpc("incrementar_reports", { questao_id_param: q.id });
        this.reportSent = true;
      } catch (e) {
        // fallback: direct update
        await this.supabaseClient
          .from("questoes")
          .update({ reports: (q.reports || 0) + 1 })
          .eq("id", q.id);
        this.reportSent = true;
      } finally {
        this.reportSending = false;
      }
    },

    exitQuiz() {
      if (confirm("Exit quiz? Your progress in this round will be lost.")) {
        this.screen = "setup";
      }
    },

    // ---------- SCREEN 4: results ----------
    backToSetup() {
      this.screen = "setup";
    },
  }));
});

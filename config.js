// Configuração pública do Pandora.
// A chave abaixo é a chave "anon" do Supabase: ela é feita para ficar no navegador.
// Quem protege seus dados é o login + as regras de segurança (RLS) do banco,
// que só liberam leitura e escrita para o e-mail autorizado.
// NUNCA coloque aqui a chave "service_role" nem a sua senha.
window.PANDORA_CONFIG = {
  SUPABASE_URL: "https://uwymolidbcjqrqfkxcuf.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3eW1vbGlkYmNqcXJxZmt4Y3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzI0MTcsImV4cCI6MjEwODEwODQxN30.Uaw9iI5c58uRtQ7xkzBb9BseaUEi9jxfJ8CujmIaHvI",
  // Nome mostrado na saudação e no relatório de cada login (chave = e-mail, em minúsculas).
  NAMES: {
    "vdomingues@alkes.com.br": "Vitor Domingues"
  }
};

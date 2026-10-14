-- Contas que já existiam nunca trocaram de senha: a senha delas é a mesma
-- desde o cadastro. Sem este ajuste, `password_changed_at` viria com o
-- instante da migração e o middleware de autenticação recusaria TODO token
-- emitido antes dela — derrubando a sessão de todo mundo de uma vez, por um
-- evento que não foi uma troca de senha.
UPDATE "users"
   SET "password_changed_at" = "created_at"
 WHERE "password_changed_at" > "created_at";

-- O convite de quem já entrou (D-135)
--
-- `household_invites.status` tinha três valores: pending, sent, dismissed.
-- Faltava o que descreve o desfecho bom — a pessoa entrou.
--
-- Sem ele, o app afirmava uma coisa falsa. Na conta do dono, agora, há dois
-- convites marcados como `sent` para a Daniela e a Paola, que já estão
-- confirmadas morando com ele há semanas. A tela dizia "aguardando" e o Pilot
-- recebia "mora nesta casa e NÃO está no EOS" — sobre duas pessoas que estão.
--
-- `dismissed` não servia: significa "desisti de convidar", que é o oposto.
-- Guardar os dois no mesmo balde perderia a diferença entre uma família que
-- desistiu e uma que conseguiu — e é a segunda que o produto existe para criar.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'household_invites_status_check'
  ) THEN
    ALTER TABLE public.household_invites DROP CONSTRAINT household_invites_status_check;
  END IF;

  ALTER TABLE public.household_invites
    ADD CONSTRAINT household_invites_status_check
    CHECK (status IN ('pending', 'sent', 'dismissed', 'joined'));
END $$;

COMMENT ON COLUMN public.household_invites.status IS
  'pending = digitado, sem círculo ainda · sent = a pessoa marcou que mandou o link · joined = já está na casa, confirmado (D-135) · dismissed = desistiu de convidar';

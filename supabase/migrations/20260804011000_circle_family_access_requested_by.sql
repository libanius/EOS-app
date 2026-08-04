-- D-108: intimate-family access is requested by the circle head/Admin and
-- accepted by the data owner. Track who initiated the request.

ALTER TABLE circle_members
  ADD COLUMN IF NOT EXISTS family_access_requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

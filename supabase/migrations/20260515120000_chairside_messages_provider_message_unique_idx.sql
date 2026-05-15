CREATE UNIQUE INDEX messages_provider_message_unique_idx ON public.messages USING btree (provider, provider_message_id, direction) WHERE (provider_message_id IS NOT NULL);

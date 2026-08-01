const vaultAddr = process.env.VAULT_ADDR;
const vaultToken = process.env.VAULT_TOKEN;

export async function vaultRead(id) {
  if (!vaultAddr || !vaultToken) return null;
  try {
    const res = await fetch(`${vaultAddr}/v1/secret/data/9router/connections/${id}`, {
      headers: { "X-Vault-Token": vaultToken },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[Vault] Read failed for ${id}: ${res.statusText}`);
      return null;
    }
    const json = await res.json();
    return json?.data?.data || null;
  } catch (err) {
    console.error(`[Vault] Read error for ${id}:`, err.message);
    return null;
  }
}

export async function vaultWrite(id, data) {
  if (!vaultAddr || !vaultToken) return;
  try {
    const res = await fetch(`${vaultAddr}/v1/secret/data/9router/connections/${id}`, {
      method: "POST",
      headers: {
        "X-Vault-Token": vaultToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      console.error(`[Vault] Write failed for ${id}: ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[Vault] Write error for ${id}:`, err.message);
  }
}

export async function vaultDelete(id) {
  if (!vaultAddr || !vaultToken) return;
  try {
    // Delete data version
    await fetch(`${vaultAddr}/v1/secret/data/9router/connections/${id}`, {
      method: "DELETE",
      headers: { "X-Vault-Token": vaultToken },
    });
    // Delete metadata / all versions
    await fetch(`${vaultAddr}/v1/secret/metadata/9router/connections/${id}`, {
      method: "DELETE",
      headers: { "X-Vault-Token": vaultToken },
    });
  } catch (err) {
    console.error(`[Vault] Delete error for ${id}:`, err.message);
  }
}

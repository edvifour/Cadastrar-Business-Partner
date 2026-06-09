# BP Backend — V4 Company

Backend mínimo que resolve CORS e faz ponte OAuth entre a ferramenta HTML e a API SAP BTP.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /health | Health check |
| POST | /cadastrar-bp | Cria BP no SAP |

## Deploy no Render

1. Suba este repositório no GitHub (repositório privado)
2. Acesse https://render.com → New → Web Service
3. Conecte o repositório
4. Configure as variáveis de ambiente (ver abaixo)
5. Build command: (vazio)
6. Start command: `node server.js`

## Variáveis de ambiente (Render)

| Variável | Valor |
|----------|-------|
| SAP_CLIENT_ID | client id do service_key.json |
| SAP_CLIENT_SECRET | client secret do service_key.json |
| SAP_TOKEN_URL | tokenurl do service_key.json |
| SAP_API_URL | url + /billing/sap/businesspartner |
| ALLOWED_ORIGIN | URL do GitHub Pages da ferramenta |

## Payload esperado (POST /cadastrar-bp)

```json
{
  "company_code": "1410",
  "cnpj_cpf": "12345678000195",
  "full_name": "EMPRESA EXEMPLO LTDA",
  "first_name": "EMPRESA",
  "last_name": "EXEMPLO LTDA",
  "sap_category": "J",
  "sap_tax_type": "BR3",
  "email": "contato@empresa.com.br",
  "phone_full": "11999998888",
  "zip_code": "01310-100",
  "street": "AV PAULISTA",
  "house_number": "1000",
  "neighborhood": "BELA VISTA",
  "city": "SAO PAULO",
  "state": "SP",
  "country": "BR",
  "source_id": null,
  "address_is_fallback": false
}
```

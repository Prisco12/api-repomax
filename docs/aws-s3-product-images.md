# Imagens de produto na AWS (S3)

## 1. Criar o bucket

No console AWS, abra **S3 > Create bucket** e use um nome globalmente único, por exemplo `repomax-prod-assets-SEU-ID-DA-CONTA`.

- Escolha a região da aplicação (para o Brasil: `sa-east-1`).
- Mantenha **Block all public access** ativado.
- Use **Bucket owner enforced** (ACLs desativadas).
- Ative versionamento e criptografia padrão SSE-S3.

O bucket deve ser privado. A API assina URLs temporárias somente para imagens de produtos publicados.

## 2. Dar acesso à aplicação

Em produção, associe uma IAM Role ao serviço que executa a API (ECS, EC2, App Runner ou similar). Não use chaves do usuário root. A role precisa somente desta policy, trocando nome e região do bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::repomax-prod-assets-SEU-ID-DA-CONTA",
      "Condition": { "StringLike": { "s3:prefix": ["products/*"] } }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::repomax-prod-assets-SEU-ID-DA-CONTA/products/*"
    }
  ]
}
```

Para testar a API na sua máquina, crie um usuário IAM específico com essa mesma policy e gere uma access key. Guarde a chave somente no `.env`, que não deve ser enviado ao Git.

## 3. Configurar o ambiente

Desenvolvimento local, sem AWS:

```env
FILE_STORAGE_DRIVER=local
FILE_LOCAL_DIRECTORY=./uploads
```

Produção com S3:

```env
FILE_STORAGE_DRIVER=s3
FILE_SIGNED_URL_TTL_SECONDS=900
AWS_REGION=sa-east-1
AWS_S3_BUCKET=repomax-prod-assets-SEU-ID-DA-CONTA
```

Ao executar na AWS com IAM Role, pare aqui: o SDK detecta automaticamente a role e não precisa de chaves no ambiente. Apenas para execução local com usuário IAM, acrescente:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## 4. CORS

Não é necessário configurar CORS no bucket neste modelo. O navegador envia o arquivo para a API, e a API grava no S3; a visualização pública é redirecionada para uma URL assinada. CORS só será necessário se futuramente o navegador enviar arquivos diretamente ao S3.

## 5. Verificar

1. Faça upload por `POST /api/v1/admin/products/:productId/images`, no campo multipart `file`.
2. Confirme que o objeto aparece no prefixo `products/` do bucket.
3. Publique o produto e abra `GET /api/v1/product-images/:imageId` no navegador: ele deve redirecionar para uma URL temporária da AWS.
4. Volte o produto a rascunho: essa mesma rota deve responder que a imagem não foi encontrada.

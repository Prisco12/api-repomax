# Imagens de produto na AWS (S3)

## 1. Criar o bucket

No console AWS, abra **S3 > Create bucket** e use um nome globalmente único, por exemplo `repomax-prod-assets-SEU-ID-DA-CONTA`.

- Escolha a região da aplicação (para o Brasil: `sa-east-1`).
- Mantenha **Block all public access** ativado.
- Use **Bucket owner enforced** (ACLs desativadas).
- Ative versionamento e criptografia padrão SSE-S3.

O bucket deve ser privado. A API assina URLs temporárias somente para imagens de produtos publicados.

## 2. Dar acesso à aplicação

Primeiro crie uma policy com apenas as permissões utilizadas pela API. Depois associe essa policy a uma role ou usuário, dependendo de onde a API estiver rodando.

### 2.1 Criar a policy do S3

1. Abra **IAM** no console da AWS.
2. No menu lateral, entre em **Policies**.
3. Clique em **Create policy**.
4. Na seção **Policy editor**, selecione a opção **JSON**.
5. Apague o conteúdo do editor e cole o JSON abaixo.
6. Substitua `repomax-prod-assets-SEU-ID-DA-CONTA` pelo nome exato do bucket criado anteriormente. Não coloque a região nem `s3://` no nome.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RepoMaxProductImages",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::repomax-prod-assets-SEU-ID-DA-CONTA/products/*"
    }
  ]
}
```

Exemplo: se o bucket se chamar `repomax-prod-assets-123456789012`, o resource será:

```text
arn:aws:s3:::repomax-prod-assets-123456789012/products/*
```

7. Clique em **Next**.
8. Em **Policy name**, informe `RepoMaxProductImagesS3Policy`.
9. Confira se aparecem somente `GetObject`, `PutObject` e `DeleteObject`.
10. Clique em **Create policy**.

Essa policy não permite listar o bucket, modificar suas configurações ou acessar arquivos fora de `products/`.

### 2.2 Se a API estiver no App Runner

Use uma **instance role**. Ela é diferente da access role usada pelo App Runner para buscar uma imagem no ECR.

1. Abra **IAM > Roles > Create role**.
2. Em **Trusted entity type**, selecione **Custom trust policy**.
3. Cole esta trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "tasks.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

4. Avance e anexe `RepoMaxProductImagesS3Policy`.
5. Dê o nome `RepoMaxAppRunnerInstanceRole` e crie a role.
6. No App Runner, abra seu serviço e entre em **Configuration > Security**.
7. Em **Instance role**, selecione `RepoMaxAppRunnerInstanceRole` e salve uma nova versão da configuração.

Não configure `AWS_ACCESS_KEY_ID` nem `AWS_SECRET_ACCESS_KEY` no App Runner. O SDK utilizado pela API encontra as credenciais temporárias da instance role automaticamente.

### 2.3 Se a API estiver no ECS/Fargate

1. Abra **IAM > Roles > Create role**.
2. Selecione **AWS service** e depois o caso de uso **Elastic Container Service Task**.
3. Anexe `RepoMaxProductImagesS3Policy`.
4. Dê o nome `RepoMaxEcsTaskRole` e crie a role.
5. Abra a task definition da API no ECS e crie uma nova revisão.
6. Em **Task role**, selecione `RepoMaxEcsTaskRole`.

Use essa role em **Task role**, não apenas em **Task execution role**. A execution role é utilizada pelo ECS para iniciar o container; a task role é entregue ao código da API.

### 2.4 Se a API estiver em uma EC2

1. Abra **IAM > Roles > Create role**.
2. Selecione **AWS service > EC2**.
3. Anexe `RepoMaxProductImagesS3Policy`.
4. Dê o nome `RepoMaxEc2Role` e crie a role.
5. Abra **EC2 > Instances**, selecione a instância e entre em **Actions > Security > Modify IAM role**.
6. Selecione `RepoMaxEc2Role` e salve.

Também nesse caso não são necessárias access keys no `.env`.

### 2.5 Se a API estiver rodando no seu computador

Para um teste local com S3, crie um usuário exclusivo da aplicação:

1. Abra **IAM > Users > Create user**.
2. Use o nome `repomax-api-local` e não habilite acesso ao console.
3. Na etapa de permissões, anexe `RepoMaxProductImagesS3Policy` diretamente ao usuário.
4. Crie o usuário e abra a aba **Security credentials**.
5. Em **Access keys**, clique em **Create access key**.
6. Escolha o caso de uso **Application running outside AWS** e confirme os avisos.
7. Copie o **Access key ID** e o **Secret access key** imediatamente. A AWS mostra o secret somente nessa criação.
8. Coloque os valores apenas no `.env` local da API.

Nunca use access keys do usuário root, não coloque as chaves no código e não envie o `.env` ao Git. Para produção dentro da AWS, prefira sempre a IAM Role com credenciais temporárias.

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

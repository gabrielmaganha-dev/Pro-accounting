import { describe, expect, it } from 'vitest';

import { loginSchema } from '../../src/validators/auth.validator.js';
import { createClientSchema, updateClientSchema } from '../../src/validators/client.validator.js';
import { createContractSchema } from '../../src/validators/contract.validator.js';
import {
  createInvoiceSchema,
  registerPaymentSchema,
} from '../../src/validators/invoice.validator.js';

describe('loginSchema', () => {
  it('normaliza o e-mail para minúsculas e sem espaços', () => {
    const parsed = loginSchema.parse({ email: '  Admin@Empresa.COM ', password: 'x' });
    expect(parsed.email).toBe('admin@empresa.com');
  });

  it('recusa senha acima de 128 caracteres (vetor de DoS no bcrypt)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) }).success).toBe(
      false,
    );
  });
});

describe('createClientSchema', () => {
  it('grava o documento só com dígitos', () => {
    const parsed = createClientSchema.parse({ name: 'Maria', cpfCnpj: '529.982.247-25' });
    expect(parsed.cpfCnpj).toBe('52998224725');
  });

  it('recusa CPF com dígito verificador errado', () => {
    const result = createClientSchema.safeParse({ name: 'Maria', cpfCnpj: '529.982.247-24' });
    expect(result.success).toBe(false);
  });

  it('recusa UF inexistente e telefone com tamanho errado', () => {
    expect(
      createClientSchema.safeParse({ name: 'Maria', cpfCnpj: '52998224725', state: 'XX' }).success,
    ).toBe(false);
    expect(
      createClientSchema.safeParse({ name: 'Maria', cpfCnpj: '52998224725', phone: '1199' })
        .success,
    ).toBe(false);
  });
});

describe('updateClientSchema', () => {
  it('campo ausente continua ausente (não mexe no valor gravado)', () => {
    const parsed = updateClientSchema.parse({ phone: '11988887777' });
    expect('email' in parsed).toBe(false);
  });

  it('campo enviado vazio vira null, para permitir APAGAR o valor gravado', () => {
    const parsed = updateClientSchema.parse({
      email: '',
      phone: '',
      zipCode: '',
      state: '',
      companyName: '',
      notes: null,
    });

    expect(parsed).toMatchObject({
      email: null,
      phone: null,
      zipCode: null,
      state: null,
      companyName: null,
      notes: null,
    });
  });
});

describe('createContractSchema', () => {
  const valid = {
    clientId: 'c1',
    number: 'ct-2026-0001',
    serviceType: 'Contabilidade',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyValue: '1500.00',
    dueDay: 10,
  };

  it('normaliza o número para maiúsculas', () => {
    expect(createContractSchema.parse(valid).number).toBe('CT-2026-0001');
  });

  it('exige cliente', () => {
    const { clientId: _omit, ...withoutClient } = valid;
    expect(createContractSchema.safeParse(withoutClient).success).toBe(false);
    expect(createContractSchema.safeParse({ ...valid, clientId: '   ' }).success).toBe(false);
  });

  it('recusa valor zero, negativo ou não numérico', () => {
    for (const monthlyValue of ['0', '-10', 'abc', '', 0, -1]) {
      expect(createContractSchema.safeParse({ ...valid, monthlyValue }).success).toBe(false);
    }
  });

  it('recusa término antes do início e dia de vencimento fora de 1..31', () => {
    expect(createContractSchema.safeParse({ ...valid, endDate: '2025-12-31' }).success).toBe(false);
    expect(createContractSchema.safeParse({ ...valid, dueDay: 0 }).success).toBe(false);
    expect(createContractSchema.safeParse({ ...valid, dueDay: 32 }).success).toBe(false);
  });

  it('arredonda o valor para centavos', () => {
    expect(createContractSchema.parse({ ...valid, monthlyValue: '10.005' }).monthlyValue).toBe(10.01);
  });
});

describe('createInvoiceSchema', () => {
  it('exige cliente e recusa vencimento antes da emissão', () => {
    const valid = {
      clientId: 'c1',
      number: 'FAT-1',
      amount: '100',
      issueDate: '2026-03-10',
      dueDate: '2026-03-20',
    };

    expect(createInvoiceSchema.safeParse(valid).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...valid, clientId: undefined }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...valid, dueDate: '2026-03-09' }).success).toBe(false);
  });
});

describe('registerPaymentSchema', () => {
  const valid = { amount: '100.00', paymentDate: '2026-03-10', paymentMethod: 'PIX' };

  it('aceita pagamento válido e confirmDuplicate falso por padrão', () => {
    const parsed = registerPaymentSchema.parse(valid);
    expect(parsed.confirmDuplicate).toBe(false);
  });

  it('recusa valor zero, negativo e forma de pagamento desconhecida', () => {
    expect(registerPaymentSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({ ...valid, amount: '-5' }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({ ...valid, paymentMethod: 'BITCOIN' }).success).toBe(
      false,
    );
  });

  it('confirmDuplicate "false" em texto NÃO pode liberar a duplicata', () => {
    // z.coerce.boolean() transforma qualquer string não vazia em true — inclusive "false".
    const parsed = registerPaymentSchema.safeParse({ ...valid, confirmDuplicate: 'false' });
    expect(parsed.success && parsed.data.confirmDuplicate).toBe(false);
  });
});

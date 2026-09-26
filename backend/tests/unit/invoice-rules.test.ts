import { InvoiceStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  isValidIsoDate,
  lastMonthKeys,
  monthLabel,
  startOfMonth,
} from '../../src/utils/date.js';
import {
  effectiveInvoiceStatus,
  fromCents,
  statusAfterPayments,
  toCents,
} from '../../src/utils/invoice-status.js';

describe('situação efetiva da fatura', () => {
  const reference = '2026-03-10';

  it('pendente vencendo hoje ainda NÃO está atrasada', () => {
    expect(effectiveInvoiceStatus(InvoiceStatus.PENDING, '2026-03-10', reference)).toBe('PENDING');
  });

  it('pendente vencida ontem está atrasada', () => {
    expect(effectiveInvoiceStatus(InvoiceStatus.PENDING, '2026-03-09', reference)).toBe('OVERDUE');
  });

  it('paga e cancelada nunca ficam atrasadas', () => {
    expect(effectiveInvoiceStatus(InvoiceStatus.PAID, '2020-01-01', reference)).toBe('PAID');
    expect(effectiveInvoiceStatus(InvoiceStatus.CANCELLED, '2020-01-01', reference)).toBe(
      'CANCELLED',
    );
  });

  it('aceita a data como Date à meia-noite UTC (formato do Prisma)', () => {
    const due = new Date(Date.UTC(2026, 2, 9));
    expect(effectiveInvoiceStatus(InvoiceStatus.PENDING, due, reference)).toBe('OVERDUE');
  });
});

describe('situação após pagamentos', () => {
  it('pagamento parcial mantém pendente', () => {
    expect(statusAfterPayments(InvoiceStatus.PENDING, 10_000, 4_000)).toBe(InvoiceStatus.PENDING);
  });

  it('pagamento que cobre o valor quita', () => {
    expect(statusAfterPayments(InvoiceStatus.PENDING, 10_000, 10_000)).toBe(InvoiceStatus.PAID);
  });

  it('estorno que reabre o saldo volta a pendente', () => {
    expect(statusAfterPayments(InvoiceStatus.PAID, 10_000, 5_000)).toBe(InvoiceStatus.PENDING);
  });

  it('cancelada continua cancelada', () => {
    expect(statusAfterPayments(InvoiceStatus.CANCELLED, 10_000, 10_000)).toBe(
      InvoiceStatus.CANCELLED,
    );
  });
});

describe('conversão de centavos', () => {
  it('não acumula erro de ponto flutuante', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30);
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
  });

  it('aceita Decimal, string e número', () => {
    expect(toCents({ toFixed: () => '1500.50' })).toBe(150_050);
    expect(toCents('1500.5')).toBe(150_050);
    expect(toCents(1500.5)).toBe(150_050);
  });

  it('fromCents sempre tem duas casas', () => {
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(5)).toBe('0.05');
    expect(fromCents(123_456)).toBe('1234.56');
  });
});

describe('datas de calendário', () => {
  it('isValidIsoDate recusa datas que o JavaScript normalizaria em silêncio', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('10/03/2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('addDays atravessa mês e ano', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths parte do primeiro dia do mês (sem pular fevereiro)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-01');
    expect(startOfMonth('2026-03-15')).toBe('2026-03-01');
  });

  it('lastMonthKeys devolve meses contínuos, inclusive virando o ano', () => {
    expect(lastMonthKeys('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('monthLabel abrevia em português', () => {
    expect(monthLabel('2026-03')).toBe('mar/26');
    expect(monthLabel('2025-12')).toBe('dez/25');
  });
});

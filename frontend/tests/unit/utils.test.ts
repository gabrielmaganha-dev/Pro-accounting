import { describe, expect, it } from 'vitest';

import { todayIso } from '@/utils/date';
import { isValidCnpj, isValidCpf, isValidCpfCnpj } from '@/utils/document';
import {
  formatCpfCnpj,
  formatCurrency,
  formatDate,
  formatPhone,
  formatZipCode,
  getInitials,
} from '@/utils/format';
import {
  maskCpfCnpj,
  maskCurrency,
  maskPhone,
  maskZipCode,
  parseCurrency,
  toCurrencyInput,
  unmask,
} from '@/utils/mask';

/** Espaço estreito que o Intl usa em "R$ 1.500,00". */
const normalizeSpaces = (value: string) => value.replace(/\s/g, ' ');

describe('máscaras de digitação', () => {
  it('CPF se forma enquanto se digita e vira CNPJ a partir do 12º dígito', () => {
    expect(maskCpfCnpj('529')).toBe('529');
    expect(maskCpfCnpj('5299822')).toBe('529.982.2');
    expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskCpfCnpj('112223330001819999')).toBe('11.222.333/0001-81');
  });

  it('telefone fixo e celular', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
    expect(maskPhone('11988887777')).toBe('(11) 98888-7777');
  });

  it('CEP', () => {
    expect(maskZipCode('01310100')).toBe('01310-100');
    expect(maskZipCode('0131')).toBe('0131');
  });

  it('dinheiro é preenchido pelos centavos, como em terminal de caixa', () => {
    expect(maskCurrency('1')).toBe('0,01');
    expect(maskCurrency('150')).toBe('1,50');
    expect(maskCurrency('150000')).toBe('1.500,00');
    expect(maskCurrency('')).toBe('');
    expect(maskCurrency('abc')).toBe('');
  });

  it('parseCurrency e toCurrencyInput são inversos e sem erro de ponto flutuante', () => {
    expect(parseCurrency('1.500,00')).toBe('1500.00');
    expect(parseCurrency('0,30')).toBe('0.30');
    expect(parseCurrency('')).toBe('');
    expect(toCurrencyInput('1500.00')).toBe('1.500,00');
    expect(toCurrencyInput('0.29')).toBe('0,29');
    expect(toCurrencyInput(null)).toBe('');
    expect(parseCurrency(toCurrencyInput('1234.56'))).toBe('1234.56');
  });

  it('unmask deixa só dígitos', () => {
    expect(unmask('529.982.247-25')).toBe('52998224725');
  });
});

describe('formatação para exibição', () => {
  it('moeda em pt-BR, aceitando string da API', () => {
    expect(normalizeSpaces(formatCurrency('1500.5'))).toBe('R$ 1.500,50');
    expect(normalizeSpaces(formatCurrency(null))).toBe('R$ 0,00');
    expect(normalizeSpaces(formatCurrency('não-numero'))).toBe('R$ 0,00');
  });

  it('data da API (YYYY-MM-DD) não "volta um dia" por causa do fuso', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('lixo')).toBe('—');
  });

  it('documentos, telefone e CEP', () => {
    expect(formatCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(formatCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCpfCnpj(null)).toBe('—');
    expect(formatPhone('11988887777')).toBe('(11) 98888-7777');
    expect(formatZipCode('01310100')).toBe('01310-100');
  });

  it('iniciais do avatar', () => {
    expect(getInitials('Maria da Silva')).toBe('MS');
    expect(getInitials('Ana')).toBe('A');
    expect(getInitials('   ')).toBe('?');
  });
});

describe('validação de documento no navegador (espelho da API)', () => {
  it('confere dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCpfCnpj('123')).toBe(false);
  });
});

describe('todayIso', () => {
  it('usa a data LOCAL, não a UTC', () => {
    // 23h de 31/12 em São Paulo já é 01/01 em UTC.
    const lateNight = new Date(2026, 11, 31, 23, 30);
    expect(todayIso(lateNight)).toBe('2026-12-31');
  });
});

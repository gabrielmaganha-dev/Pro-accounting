import { describe, expect, it } from 'vitest';

import {
  isValidCnpj,
  isValidCpf,
  isValidCpfCnpj,
  isValidState,
  onlyDigits,
} from '../../src/utils/document.js';
import { makeCnpj, makeCpf } from '../helpers.js';

describe('validação de CPF', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
  });

  it('recusa sequências repetidas, que passariam no cálculo', () => {
    for (let digit = 0; digit <= 9; digit += 1) {
      expect(isValidCpf(String(digit).repeat(11))).toBe(false);
    }
  });

  it('recusa tamanho diferente de 11', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247255')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('o gerador dos testes produz CPFs válidos', () => {
    for (const seed of [1, 42, 123456789, 987654321]) {
      expect(isValidCpf(makeCpf(seed))).toBe(true);
    }
  });
});

describe('validação de CNPJ', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('recusa sequências repetidas', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('o gerador dos testes produz CNPJs válidos', () => {
    for (const seed of [1, 42, 11222333, 99999999]) {
      expect(isValidCnpj(makeCnpj(seed))).toBe(true);
    }
  });
});

describe('isValidCpfCnpj', () => {
  it('decide pelo número de dígitos', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true);
    expect(isValidCpfCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCpfCnpj('123')).toBe(false);
    expect(isValidCpfCnpj('1234567890123')).toBe(false);
  });
});

describe('utilitários de documento', () => {
  it('onlyDigits remove máscara e letras', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
    expect(onlyDigits('(11) 98888-7777')).toBe('11988887777');
    expect(onlyDigits('abc')).toBe('');
  });

  it('isValidState aceita as 27 UFs sem diferenciar caixa', () => {
    expect(isValidState('SP')).toBe(true);
    expect(isValidState('df')).toBe(true);
    expect(isValidState('XX')).toBe(false);
  });
});

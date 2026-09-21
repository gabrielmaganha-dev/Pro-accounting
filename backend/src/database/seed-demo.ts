import { ClientStatus, ContractStatus, InvoiceStatus, PaymentMethod } from '@prisma/client';

import { prisma, disconnectDatabase } from '../config/prisma.js';
import { addDays, addMonths, isoDateToUtc, startOfMonth, today } from '../utils/date.js';

/**
 * Dados de DEMONSTRAÇÃO para o painel.
 *
 * Rode com: npm run db:seed:demo
 *
 * Isto é separado de `seed.ts` (que cria apenas o administrador) de propósito:
 * o seed do administrador é necessário em qualquer ambiente, inclusive
 * produção; este aqui jamais deve rodar em produção.
 *
 * Duas características importantes:
 *
 *  • DETERMINÍSTICO — nenhum valor aleatório. Rodando duas vezes, os mesmos
 *    registros e os mesmos totais. É isso que permite conferir os cálculos do
 *    painel: o script imprime, ao final, os totais que ele mesmo calculou em
 *    JavaScript, e eles têm de bater com o que a API devolve somando em SQL.
 *    Duas implementações independentes chegando ao mesmo número é uma
 *    verificação de verdade; olhar a tela e ver "tem números lá" não é.
 *
 *  • COBRE OS CASOS DE BORDA — inclui fatura vencida, vencendo hoje, vencendo
 *    em poucos dias, cancelada, e uma com PAGAMENTO PARCIAL, que é o caso que
 *    diferencia "valor de face" de "saldo em aberto" nos cálculos.
 */

const REFERENCE_DATE = today();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

interface ClientSeed {
  name: string;
  companyName: string | null;
  cpfCnpj: string;
  /** "ISENTO" para quem não contribui de ICMS — caso comum em serviços. */
  stateRegistration: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  status: ClientStatus;
  /** Há quantos meses foi cadastrado — alimenta o gráfico de clientes novos. */
  createdMonthsAgo: number;
}

const CLIENTS: ClientSeed[] = [
  {
    name: 'Padaria Pão Quente Ltda',
    companyName: 'Pão Quente',
    cpfCnpj: '12345678000190',
    stateRegistration: '110042490114',
    email: 'financeiro@paoquente.com.br',
    phone: '11987654321',
    zipCode: '01310100',
    street: 'Avenida Paulista',
    number: '1578',
    complement: 'Loja 3',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 11,
  },
  {
    name: 'Construtora Alicerce S.A.',
    companyName: 'Alicerce',
    cpfCnpj: '98765432000111',
    stateRegistration: '244875120336',
    email: 'contato@alicerce.com.br',
    phone: '11912345678',
    zipCode: '13015904',
    street: 'Rua Barão de Jaguara',
    number: '1481',
    complement: 'Sala 12',
    neighborhood: 'Centro',
    city: 'Campinas',
    state: 'SP',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 10,
  },
  {
    name: 'Clínica Vida Saudável Ltda',
    companyName: 'Vida Saudável',
    cpfCnpj: '45678912000133',
    stateRegistration: 'ISENTO',
    email: 'adm@vidasaudavel.com.br',
    phone: '2133445566',
    zipCode: '22041011',
    street: 'Avenida Nossa Senhora de Copacabana',
    number: '861',
    complement: null,
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 8,
  },
  {
    name: 'Transportes Rota Certa ME',
    companyName: 'Rota Certa',
    cpfCnpj: '32165498000177',
    stateRegistration: '9078451230',
    email: 'fiscal@rotacerta.com.br',
    phone: '4199887766',
    zipCode: '80010010',
    street: 'Rua XV de Novembro',
    number: '620',
    complement: 'Galpão B',
    neighborhood: 'Centro',
    city: 'Curitiba',
    state: 'PR',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 5,
  },
  {
    name: 'Maria Aparecida de Souza',
    companyName: null,
    cpfCnpj: '11122233344',
    stateRegistration: 'ISENTO',
    email: 'maria.souza@email.com.br',
    phone: '31988776655',
    zipCode: '30130010',
    street: 'Avenida Afonso Pena',
    number: '1270',
    complement: 'Apto 802',
    neighborhood: 'Centro',
    city: 'Belo Horizonte',
    state: 'MG',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 3,
  },
  {
    name: 'Tech Solutions Sistemas Ltda',
    companyName: 'Tech Solutions',
    cpfCnpj: '78912345000144',
    stateRegistration: '0961234567',
    email: 'contato@techsolutions.com.br',
    phone: '51999887766',
    zipCode: '90010150',
    street: 'Rua dos Andradas',
    number: '1234',
    complement: 'Conjunto 501',
    neighborhood: 'Centro Histórico',
    city: 'Porto Alegre',
    state: 'RS',
    status: ClientStatus.ACTIVE,
    createdMonthsAgo: 1,
  },
  {
    name: 'Mercado Bom Preço Ltda',
    companyName: 'Bom Preço',
    cpfCnpj: '65498732000122',
    stateRegistration: '183456789',
    email: 'contato@bompreco.com.br',
    phone: '8133224455',
    zipCode: '50030230',
    street: 'Avenida Rio Branco',
    number: '245',
    complement: null,
    neighborhood: 'Recife Antigo',
    city: 'Recife',
    state: 'PE',
    status: ClientStatus.INACTIVE,
    createdMonthsAgo: 9,
  },
  {
    name: 'João Carlos Ferreira',
    companyName: null,
    cpfCnpj: '55566677788',
    stateRegistration: 'ISENTO',
    email: 'joao.ferreira@email.com.br',
    phone: '6298765432',
    zipCode: '74003010',
    street: 'Avenida Goiás',
    number: '480',
    complement: null,
    neighborhood: 'Setor Central',
    city: 'Goiânia',
    state: 'GO',
    status: ClientStatus.INACTIVE,
    createdMonthsAgo: 6,
  },
];

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

interface ContractSeed {
  clientIndex: number;
  serviceType: string;
  monthlyValue: number;
  dueDay: number;
  status: ContractStatus;
  startMonthsAgo: number;
  /** Dias a partir de hoje. null = prazo indeterminado. */
  endInDays: number | null;
  /** Se gera faturas mensais no histórico. */
  billing: boolean;
}

const CONTRACTS: ContractSeed[] = [
  // Ativo, prazo indeterminado — o caso mais comum do escritório.
  {
    clientIndex: 0,
    serviceType: 'Contabilidade mensal',
    monthlyValue: 890,
    dueDay: 10,
    status: ContractStatus.ACTIVE,
    startMonthsAgo: 11,
    endInDays: null,
    billing: true,
  },
  {
    clientIndex: 1,
    serviceType: 'Contabilidade mensal + Departamento pessoal',
    monthlyValue: 2100,
    dueDay: 5,
    status: ContractStatus.ACTIVE,
    startMonthsAgo: 10,
    endInDays: null,
    billing: true,
  },
  // Ativo VENCENDO em 15 dias — alimenta o alerta de contrato a vencer.
  {
    clientIndex: 2,
    serviceType: 'Fiscal e tributário',
    monthlyValue: 1250,
    dueDay: 15,
    status: ContractStatus.ACTIVE,
    startMonthsAgo: 8,
    endInDays: 15,
    billing: true,
  },
  // Ativo vencendo em 25 dias — segundo item do mesmo alerta.
  {
    clientIndex: 3,
    serviceType: 'Contabilidade mensal',
    monthlyValue: 675,
    dueDay: 20,
    status: ContractStatus.ACTIVE,
    startMonthsAgo: 5,
    endInDays: 25,
    billing: true,
  },
  // Ativo com término distante — NÃO deve aparecer no alerta.
  {
    clientIndex: 5,
    serviceType: 'Consultoria contábil',
    monthlyValue: 1500,
    dueDay: 25,
    status: ContractStatus.ACTIVE,
    startMonthsAgo: 1,
    endInDays: 300,
    billing: true,
  },
  {
    clientIndex: 4,
    serviceType: 'Imposto de renda pessoa física',
    monthlyValue: 450,
    dueDay: 12,
    status: ContractStatus.RENEWAL,
    startMonthsAgo: 3,
    endInDays: 40,
    billing: false,
  },
  {
    clientIndex: 6,
    serviceType: 'Contabilidade mensal',
    monthlyValue: 780,
    dueDay: 8,
    status: ContractStatus.CLOSED,
    startMonthsAgo: 9,
    endInDays: -60,
    billing: false,
  },
  {
    clientIndex: 7,
    serviceType: 'Abertura de empresa',
    monthlyValue: 1200,
    dueDay: 18,
    status: ContractStatus.CANCELLED,
    startMonthsAgo: 6,
    endInDays: -90,
    billing: false,
  },
];

/** Meses de histórico de faturamento gerados para cada contrato ativo. */
const BILLING_MONTHS = 12;

/** Quantos dias após o vencimento o pagamento é registrado (contratos pagantes). */
const PAYMENT_DELAY_DAYS = 1;

const PAYMENT_METHODS = [
  PaymentMethod.PIX,
  PaymentMethod.BOLETO,
  PaymentMethod.TRANSFER,
  PaymentMethod.CARD,
];

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Data de vencimento da fatura de um mês, respeitando o dia do contrato.
 *
 * Se o contrato vence dia 31 e o mês tem 30 dias, cai no último dia do mês —
 * criar 31/04 lançaria erro no banco.
 */
function dueDateFor(monthStart: string, dueDay: number): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDayOfMonth);

  return `${monthStart.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

async function wipeDemoData(): Promise<void> {
  // Ordem obrigatória: as chaves estrangeiras usam onDelete Restrict, então
  // os filhos têm de sair antes dos pais. A tabela `users` não é tocada — o
  // administrador criado pelo seed principal permanece.
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.client.deleteMany();
}

async function main(): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, name: true },
  });

  if (!admin) {
    console.error('');
    console.error('  Nenhum administrador encontrado.');
    console.error('  Rode antes: npm run db:seed');
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.info('');
  console.info(`  Data de referência: ${REFERENCE_DATE}`);
  console.info('  Limpando dados de demonstração anteriores...');
  await wipeDemoData();

  // --- Clientes ------------------------------------------------------------
  const clientIds: string[] = [];

  for (const seed of CLIENTS) {
    const createdAt = isoDateToUtc(addMonths(startOfMonth(REFERENCE_DATE), -seed.createdMonthsAgo));
    // 14h UTC = 11h em Brasília: um horário comercial plausível, longe da
    // virada do dia, para o agrupamento por mês não depender do fuso.
    createdAt.setUTCHours(14, 30, 0, 0);

    const client = await prisma.client.create({
      data: {
        name: seed.name,
        companyName: seed.companyName,
        cpfCnpj: seed.cpfCnpj,
        stateRegistration: seed.stateRegistration,
        email: seed.email,
        phone: seed.phone,
        whatsapp: seed.phone,
        zipCode: seed.zipCode,
        street: seed.street,
        number: seed.number,
        complement: seed.complement,
        neighborhood: seed.neighborhood,
        city: seed.city,
        state: seed.state,
        status: seed.status,
        createdAt,
      },
      select: { id: true },
    });

    clientIds.push(client.id);
  }

  console.info(`  ${clientIds.length} clientes criados.`);

  // --- Contratos e faturas -------------------------------------------------
  let contractCount = 0;
  let invoiceNumber = 0;

  // Totais calculados aqui em JavaScript, para conferir contra o SQL da API.
  let expectedReceived = 0;
  let expectedPendingOutstanding = 0;
  let expectedOverdueOutstanding = 0;
  let paidInvoices = 0;
  let pendingInvoices = 0;
  let overdueInvoices = 0;
  let cancelledInvoices = 0;
  let paymentCount = 0;

  for (const [contractIndex, seed] of CONTRACTS.entries()) {
    const clientId = clientIds[seed.clientIndex];
    if (!clientId) continue;

    const startDate = addMonths(startOfMonth(REFERENCE_DATE), -seed.startMonthsAgo);
    const endDate = seed.endInDays === null ? null : addDays(REFERENCE_DATE, seed.endInDays);

    const contract = await prisma.contract.create({
      data: {
        clientId,
        number: `CT-2026-${String(contractIndex + 1).padStart(4, '0')}`,
        serviceType: seed.serviceType,
        startDate: isoDateToUtc(startDate),
        endDate: endDate ? isoDateToUtc(endDate) : null,
        monthlyValue: money(seed.monthlyValue),
        dueDay: seed.dueDay,
        status: seed.status,
      },
      select: { id: true },
    });

    contractCount += 1;

    if (!seed.billing) continue;

    // Faturas: do mês mais antigo (11 meses atrás) até o mês corrente.
    for (let monthsAgo = BILLING_MONTHS - 1; monthsAgo >= 0; monthsAgo -= 1) {
      const monthStart = addMonths(startOfMonth(REFERENCE_DATE), -monthsAgo);

      // Não fatura meses anteriores ao início do contrato.
      if (monthStart < startOfMonth(startDate)) continue;

      invoiceNumber += 1;
      const dueDate = dueDateFor(monthStart, seed.dueDay);
      const amount = seed.monthlyValue;

      // Decide o desfecho da fatura de forma determinística:
      //  • meses anteriores ao corrente -> pagas (exceto os casos de borda abaixo)
      //  • mês corrente                 -> pendentes
      const isCurrentMonth = monthsAgo === 0;
      const isPreviousMonth = monthsAgo === 1;

      // CASO DE BORDA 1: uma fatura cancelada no histórico.
      if (monthsAgo === 4 && contractIndex === 0) {
        await prisma.invoice.create({
          data: {
            clientId,
            contractId: contract.id,
            number: `FAT-2026-${String(invoiceNumber).padStart(5, '0')}`,
            description: `${seed.serviceType} — ${monthStart.slice(0, 7)}`,
            amount: money(amount),
            issueDate: isoDateToUtc(monthStart),
            dueDate: isoDateToUtc(dueDate),
            status: InvoiceStatus.CANCELLED,
          },
        });
        cancelledInvoices += 1;
        continue;
      }

      // CASO DE BORDA 2: mês anterior não pago no contrato 2 -> ATRASADA.
      // Fica com status PENDING no banco; o painel deve derivar OVERDUE
      // porque a data de vencimento já passou.
      if (isPreviousMonth && contractIndex === 2) {
        await prisma.invoice.create({
          data: {
            clientId,
            contractId: contract.id,
            number: `FAT-2026-${String(invoiceNumber).padStart(5, '0')}`,
            description: `${seed.serviceType} — ${monthStart.slice(0, 7)}`,
            amount: money(amount),
            issueDate: isoDateToUtc(monthStart),
            dueDate: isoDateToUtc(dueDate),
            status: InvoiceStatus.PENDING,
          },
        });
        overdueInvoices += 1;
        expectedOverdueOutstanding += amount;
        continue;
      }

      // CASO DE BORDA 3: mês anterior do contrato 3 com PAGAMENTO PARCIAL.
      // Continua PENDING e vencida; só 40% do valor entrou. O painel deve
      // contar o saldo de 60% como atrasado, não o valor cheio.
      if (isPreviousMonth && contractIndex === 3) {
        const invoice = await prisma.invoice.create({
          data: {
            clientId,
            contractId: contract.id,
            number: `FAT-2026-${String(invoiceNumber).padStart(5, '0')}`,
            description: `${seed.serviceType} — ${monthStart.slice(0, 7)}`,
            amount: money(amount),
            issueDate: isoDateToUtc(monthStart),
            dueDate: isoDateToUtc(dueDate),
            status: InvoiceStatus.PENDING,
          },
          select: { id: true },
        });

        const partial = Math.round(amount * 0.4 * 100) / 100;

        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: money(partial),
            paymentDate: isoDateToUtc(addDays(dueDate, PAYMENT_DELAY_DAYS)),
            paymentMethod: PaymentMethod.PIX,
            registeredBy: admin.id,
            notes: 'Pagamento parcial acordado com o cliente.',
          },
        });

        overdueInvoices += 1;
        paymentCount += 1;
        expectedReceived += partial;
        expectedOverdueOutstanding += amount - partial;
        continue;
      }

      if (isCurrentMonth) {
        // Mês corrente: distribui os vencimentos para exercitar os três
        // alertas — vencida, vence hoje, vence nos próximos dias.
        let currentDueDate = dueDate;

        if (contractIndex === 0) currentDueDate = REFERENCE_DATE; // vence hoje
        else if (contractIndex === 1) currentDueDate = addDays(REFERENCE_DATE, 3); // em breve
        else if (contractIndex === 2) currentDueDate = addDays(REFERENCE_DATE, -6); // vencida
        else if (contractIndex === 3) currentDueDate = addDays(REFERENCE_DATE, 6); // em breve
        else currentDueDate = addDays(REFERENCE_DATE, 20); // fora da janela

        await prisma.invoice.create({
          data: {
            clientId,
            contractId: contract.id,
            number: `FAT-2026-${String(invoiceNumber).padStart(5, '0')}`,
            description: `${seed.serviceType} — ${monthStart.slice(0, 7)}`,
            amount: money(amount),
            issueDate: isoDateToUtc(monthStart),
            dueDate: isoDateToUtc(currentDueDate),
            status: InvoiceStatus.PENDING,
          },
        });

        if (currentDueDate < REFERENCE_DATE) {
          overdueInvoices += 1;
          expectedOverdueOutstanding += amount;
        } else {
          pendingInvoices += 1;
          expectedPendingOutstanding += amount;
        }

        continue;
      }

      // Caso normal: fatura paga integralmente.
      const invoice = await prisma.invoice.create({
        data: {
          clientId,
          contractId: contract.id,
          number: `FAT-2026-${String(invoiceNumber).padStart(5, '0')}`,
          description: `${seed.serviceType} — ${monthStart.slice(0, 7)}`,
          amount: money(amount),
          issueDate: isoDateToUtc(monthStart),
          dueDate: isoDateToUtc(dueDate),
          status: InvoiceStatus.PAID,
        },
        select: { id: true },
      });

      const method = PAYMENT_METHODS[invoiceNumber % PAYMENT_METHODS.length] ?? PaymentMethod.PIX;

      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: money(amount),
          paymentDate: isoDateToUtc(addDays(dueDate, PAYMENT_DELAY_DAYS)),
          paymentMethod: method,
          registeredBy: admin.id,
        },
      });

      paidInvoices += 1;
      paymentCount += 1;
      expectedReceived += amount;
    }
  }

  const totalInvoices = paidInvoices + pendingInvoices + overdueInvoices + cancelledInvoices;

  console.info(`  ${contractCount} contratos criados.`);
  console.info(`  ${totalInvoices} faturas criadas.`);
  console.info(`  ${paymentCount} pagamentos registrados.`);
  console.info('');
  console.info('  ---------------------------------------------------------');
  console.info('  TOTAIS ESPERADOS (calculados aqui, em JavaScript)');
  console.info('  Compare com GET /api/dashboard, que soma em SQL.');
  console.info('  ---------------------------------------------------------');
  console.info(`  clientes.total ......... ${CLIENTS.length}`);
  console.info(
    `  clientes.ativos ........ ${CLIENTS.filter((c) => c.status === ClientStatus.ACTIVE).length}`,
  );
  console.info(
    `  clientes.inativos ...... ${CLIENTS.filter((c) => c.status === ClientStatus.INACTIVE).length}`,
  );
  console.info(
    `  contratos.ativos ....... ${CONTRACTS.filter((c) => c.status === ContractStatus.ACTIVE).length}`,
  );
  console.info(`  faturas.total .......... ${totalInvoices}`);
  console.info(`  faturas.pagas .......... ${paidInvoices}`);
  console.info(`  faturas.pendentes ...... ${pendingInvoices}`);
  console.info(`  faturas.atrasadas ...... ${overdueInvoices}`);
  console.info(`  faturas.canceladas ..... ${cancelledInvoices}`);
  console.info(`  valores.recebido ....... ${money(expectedReceived)}`);
  console.info(`  valores.pendente ....... ${money(expectedPendingOutstanding)}`);
  console.info(`  valores.atrasado ....... ${money(expectedOverdueOutstanding)}`);
  console.info('  ---------------------------------------------------------');
  console.info('');
}

main()
  .catch((error: unknown) => {
    console.error('');
    console.error('  Falha ao gerar os dados de demonstração:');
    console.error(error);
    console.error('');
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDatabase();
  });

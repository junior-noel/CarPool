import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Ride, RideStatus } from './ride.entity.js';
import { RidesService } from './rides.service.js';
import { SearchRidesDto } from './dto/search-rides.dto.js';
import { Vehicle } from '../vehicles/vehicle.entity.js';
import type { UserService } from '../users/user.service.js';

interface SearchRow {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  pricePerSeat: string | number;
  availableSeats: number;
  status: RideStatus;
  driverId: string;
  driverFirstName: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleCapacity: number;
}

// Match PostgreSQL LIKE patterns, treating exclamation as the escape character.
function matchesLike(value: string, pattern: string): boolean {
  const escapeRegex = (character: string) =>
    character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let expression = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '!') {
      index += 1;
      expression += escapeRegex(pattern[index] ?? '!');
    } else if (character === '%') {
      expression += '.*';
    } else if (character === '_') {
      expression += '.';
    } else {
      expression += escapeRegex(character);
    }
  }

  return new RegExp(`${expression}$`, 'i').test(value);
}

// Build an in-memory query builder that applies the service's bound search parameters.
function createQueryBuilder(rows: SearchRow[]) {
  const conditions: Array<{
    expression: string;
    parameters?: Record<string, unknown>;
  }> = [];
  let offset = 0;
  let pageLimit = rows.length;
  const builder: Record<string, unknown> = {};
  const chain = (name: string) => {
    builder[name] = vi.fn((...args: unknown[]) => {
      if (name === 'where' || name === 'andWhere') {
        conditions.push({
          expression: String(args[0]),
          parameters: args[1] as Record<string, unknown> | undefined,
        });
      }
      if (name === 'skip') offset = Number(args[0]);
      if (name === 'take') pageLimit = Number(args[0]);
      return builder;
    });
  };

  for (const name of [
    'leftJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    chain(name);
  }

  const filteredAndSorted = () => {
    let selected = rows.filter((row) => row.status === RideStatus.SCHEDULED);
    const parameters = Object.assign(
      {},
      ...conditions.map((condition) => condition.parameters),
    );
    const localDate = String(parameters.localDate);
    const localTime = String(parameters.localTime);
    selected = selected.filter(
      (row) =>
        row.departureDate > localDate ||
        (row.departureDate === localDate && row.departureTime > localTime),
    );
    selected = selected.filter(
      (row) => row.availableSeats >= Number(parameters.minimumSeats),
    );

    if (parameters.originPattern !== undefined) {
      selected = selected.filter((row) =>
        matchesLike(row.origin.trim(), String(parameters.originPattern)),
      );
    }
    if (parameters.destinationPattern !== undefined) {
      selected = selected.filter((row) =>
        matchesLike(
          row.destination.trim(),
          String(parameters.destinationPattern),
        ),
      );
    }
    if (parameters.departureDate !== undefined) {
      selected = selected.filter(
        (row) => row.departureDate === parameters.departureDate,
      );
    }
    if (parameters.maxPricePerSeat !== undefined) {
      selected = selected.filter(
        (row) => Number(row.pricePerSeat) <= Number(parameters.maxPricePerSeat),
      );
    }

    return selected.sort(
      (left, right) =>
        left.departureDate.localeCompare(right.departureDate) ||
        left.departureTime.localeCompare(right.departureTime) ||
        left.id.localeCompare(right.id),
    );
  };

  builder.getCount = vi.fn(async () => filteredAndSorted().length);
  builder.getRawMany = vi.fn(async () =>
    filteredAndSorted().slice(offset, offset + pageLimit),
  );

  return {
    builder: builder as unknown as SelectQueryBuilder<Ride>,
    conditions,
  };
}

// Create a public raw ride row with unique defaults for filter scenarios.
function createRow(overrides: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 'ride-a',
    origin: 'Yaoundé Centre',
    destination: 'Douala Bonaberi',
    departureDate: '2026-10-01',
    departureTime: '13:30:00',
    pricePerSeat: '2500.00',
    availableSeats: 4,
    status: RideStatus.SCHEDULED,
    driverId: 'driver-id',
    driverFirstName: 'Alex',
    vehicleModel: 'Corolla',
    vehicleColor: 'Silver',
    vehicleCapacity: 5,
    ...overrides,
  };
}

// Construct a rides service with a fixed IANA timezone and supplied raw query rows.
function createService(rows: SearchRow[], timeZone = 'Africa/Douala') {
  const query = createQueryBuilder(rows);
  const repository = {
    createQueryBuilder: vi.fn(() => query.builder),
  };
  const configService = {
    get: vi.fn((key: string) =>
      key === 'APP_TIMEZONE' ? timeZone : undefined,
    ),
  };
  const service = new RidesService(
    repository as unknown as Repository<Ride>,
    {} as Repository<Vehicle>,
    {} as UserService,
    configService as unknown as ConfigService,
  );

  return { service, repository, query, configService };
}

describe('RidesService.search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns only future scheduled rides with enough seats and an allowlisted response', async () => {
    const rows = [
      createRow(),
      createRow({ id: 'ride-before-now', departureTime: '12:59:59' }),
      createRow({ id: 'ride-at-now', departureTime: '13:00:00' }),
      createRow({ id: 'ride-full', availableSeats: 0 }),
      createRow({ id: 'ride-cancelled', status: RideStatus.CANCELLED }),
      createRow({ id: 'ride-completed', status: RideStatus.COMPLETED }),
      createRow({ id: 'ride-ongoing', status: RideStatus.ONGOING }),
      createRow({ id: 'ride-other-day', departureDate: '2026-10-02' }),
    ];
    const { service, query } = createService(rows);

    const result = await service.search(new SearchRidesDto());

    expect(result.items.map((item) => item.id)).toEqual([
      'ride-a',
      'ride-other-day',
    ]);
    expect(query.conditions[1].parameters).toMatchObject({ minimumSeats: 1 });
    expect(query.conditions[2].parameters).toEqual({
      localDate: '2026-10-01',
      localTime: '13:00:00',
    });
    expect(Object.keys(result.items[0])).toEqual([
      'id',
      'origin',
      'destination',
      'departureDate',
      'departureTime',
      'pricePerSeat',
      'availableSeats',
      'status',
      'driver',
      'vehicle',
    ]);
    expect(JSON.stringify(result.items[0])).not.toMatch(
      /password|email|phoneNumber|licensePlate|plate|otp|token/i,
    );
  });

  it('uses the configured timezone for the today cutoff', async () => {
    const rows = [
      createRow({ id: 'earlier-today', departureTime: '12:59:59' }),
      createRow({ id: 'later-today', departureTime: '13:00:01' }),
    ];
    const { service, query } = createService(rows, 'Africa/Douala');

    const result = await service.search(new SearchRidesDto());

    expect(result.items.map((item) => item.id)).toEqual(['later-today']);
    expect(query.conditions[2].parameters).toEqual({
      localDate: '2026-10-01',
      localTime: '13:00:00',
    });
    expect(query.conditions[2].expression).toContain('departureDate');
    expect(query.conditions[2].expression).toContain('departureTime');
  });

  it.each([
    {
      name: 'origin alone',
      query: { origin: '  yAoundé ' },
      expected: ['ride-a'],
    },
    {
      name: 'destination alone',
      query: { destination: ' BONABERI ' },
      expected: ['ride-a'],
    },
    { name: 'date alone', query: { date: '2026-10-01' }, expected: ['ride-a'] },
    {
      name: 'minimum seats alone',
      query: { minSeats: 3 },
      expected: ['ride-a'],
    },
    {
      name: 'maximum price alone',
      query: { maxPricePerSeat: 2500 },
      expected: ['ride-a'],
    },
    {
      name: 'combined filters',
      query: {
        origin: 'yaoundé',
        destination: 'bonaberi',
        date: '2026-10-01',
        minSeats: 3,
        maxPricePerSeat: 2500,
      },
      expected: ['ride-a'],
    },
  ])('applies $name', async ({ query, expected }) => {
    const { service } = createService([
      createRow(),
      createRow({
        id: 'ride-b',
        origin: 'Bamenda',
        destination: 'Limbe',
        departureDate: '2026-10-02',
        departureTime: '09:00:00',
        pricePerSeat: 3000,
        availableSeats: 2,
      }),
    ]);

    const result = await service.search(plainToInstance(SearchRidesDto, query));

    expect(result.items.map((item) => item.id)).toEqual(expected);
  });

  it('matches case-insensitively but remains accent-sensitive', async () => {
    const { service } = createService([
      createRow(),
      createRow({ id: 'unaccented', origin: 'Yaounde Centre' }),
    ]);

    const accented = await service.search(
      plainToInstance(SearchRidesDto, { origin: 'YAOUNDÉ' }),
    );
    const unaccented = await service.search(
      plainToInstance(SearchRidesDto, { origin: 'yaounde' }),
    );

    expect(accented.items.map((item) => item.id)).toEqual(['ride-a']);
    expect(unaccented.items.map((item) => item.id)).toEqual(['unaccented']);
  });

  it('escapes percent, underscore, backslash, and the escape character as literals', async () => {
    const { service, query } = createService([
      createRow({ id: 'literal', origin: 'North_100% Road\\West' }),
      createRow({ id: 'wildcard-lookalike', origin: 'NorthX100Y Road\\West' }),
    ]);

    const result = await service.search(
      plainToInstance(SearchRidesDto, { origin: 'North_100% Road\\' }),
    );

    expect(result.items.map((item) => item.id)).toEqual(['literal']);
    expect(
      query.conditions.find((condition) => condition.parameters?.originPattern)
        ?.parameters,
    ).toMatchObject({ originPattern: '%North!_100!% Road!\\%' });
  });

  it('uses stable sorting and does not repeat or skip rides across pages', async () => {
    const rows = [
      createRow({ id: 'ride-c' }),
      createRow({ id: 'ride-a' }),
      createRow({ id: 'ride-b' }),
    ];
    const { service } = createService(rows);
    const firstPage = await service.search(
      plainToInstance(SearchRidesDto, { page: '1', limit: '2' }),
    );
    const secondPage = await service.search(
      plainToInstance(SearchRidesDto, { page: '2', limit: '2' }),
    );

    expect(firstPage.items.map((item) => item.id)).toEqual([
      'ride-a',
      'ride-b',
    ]);
    expect(secondPage.items.map((item) => item.id)).toEqual(['ride-c']);
    expect(firstPage.total).toBe(3);
    expect(firstPage.totalPages).toBe(2);
    expect(secondPage.total).toBe(3);
  });

  it('applies the default page and limit and supports the maximum limit', async () => {
    const rows = Array.from({ length: 55 }, (_, index) =>
      createRow({ id: `ride-${String(index).padStart(2, '0')}` }),
    );
    const { service } = createService(rows);

    const defaults = await service.search(new SearchRidesDto());
    const maximum = await service.search(
      plainToInstance(SearchRidesDto, { limit: '50' }),
    );

    expect(defaults).toMatchObject({
      page: 1,
      limit: 20,
      total: 55,
      totalPages: 3,
    });
    expect(defaults.items).toHaveLength(20);
    expect(maximum).toMatchObject({
      page: 1,
      limit: 50,
      total: 55,
      totalPages: 2,
    });
    expect(maximum.items).toHaveLength(50);
  });
});

describe('SearchRidesDto query validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  async function validateQuery(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: SearchRidesDto,
      data: '',
    });
  }

  it.each([
    { date: '2026-02-30' },
    { minSeats: '0' },
    { maxPricePerSeat: '-1' },
    { page: '0' },
    { limit: '51' },
    { origin: 'x'.repeat(101) },
    { unknown: 'value' },
  ])('returns 400 for invalid query %o', async (query) => {
    await expect(validateQuery(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

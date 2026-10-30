interface Keyed {
	key: string;
	externalRef?: { key: string } | null;
}

export const displayKey = (entity: Keyed): string => entity.externalRef?.key ?? entity.key;

export const displayKeyTitle = (entity: Keyed): string | undefined =>
	entity.externalRef ? `Briefline key: ${entity.key}` : undefined;

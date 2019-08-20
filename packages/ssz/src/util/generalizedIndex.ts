import {FullSSZType, Type} from "../types";
import {fixedSize} from "../size";
import {isBasicType} from "./types";
import assert from "assert";
import { nextPowerOf2, previousPowerOf2 } from "./hash";

export type GeneralizedIndex = bigint;
export type PathElement = number | string;
export type Path = PathElement[];

/**
 * Return the number of bytes in a basic type, or 32 (a full hash) for compound types.
 */
export function itemLength(type: FullSSZType): number {
  if (isBasicType(type)) {
    return fixedSize(type)
  } else {
    return 32;
  }
}

/**
 * Return the type of the element of an object of the given type with the given index
 * or member variable name (eg. `7` for `x[7]`, `"foo"` for `x.foo`)
 */
export function getElementType(type: FullSSZType, indexOrFieldName: PathElement): FullSSZType {
  switch (type.type) {
    case Type.byteList:
    case Type.byteVector:
      return {
        type: Type.uint,
        byteLength: 1,
        useNumber: true,
      };
    case Type.list:
    case Type.vector:
      return type.elementType;
    case Type.container:
      return type.fields.find(([fieldName]) => indexOrFieldName === fieldName)[1];
    default:
      throw new Error("unsupported type");
  }
}

/**
 * Return the number of hashes needed to represent the top-level elements in the given type
 * (eg. `x.foo` or `x[7]` but not `x[7].bar` or `x.foo.baz`). In all cases except lists/vectors
 * of basic types, this is simply the number of top-level elements, as each element gets one
 * hash. For lists/vectors of basic types, it is often fewer because multiple basic elements
 */
export function chunkCount(type: FullSSZType): number {
  if (type.type === Type.container) {
    return type.fields.length;
  } else {
    throw new Error("unsupported type");
  }
}

/**
 * Return three variables:
 * (i) the index of the chunk in which the given element of the item is represented;
 * (ii) the starting byte position within the chunk;
 * (iii) the ending byte position within the chunk.
 *  For example: for a 6-item list of uint64 values, index=2 will return (0, 16, 24), index=5 will return (1, 8, 16)
 */
export function getItemPosition(type: FullSSZType, indexOrFieldName: PathElement): [number, number, number] {
  switch (type.type) {
    case Type.byteList:
    case Type.byteVector:
      assert(Number.isSafeInteger(indexOrFieldName as number));
      const bStart = (indexOrFieldName as number) * 8;
      return [Math.floor(bStart / 32), bStart % 32, bStart % 32 + 8];
    case Type.list:
    case Type.vector:
      assert(Number.isSafeInteger(indexOrFieldName as number));
      const elementItemLength = itemLength(type.elementType);
      const start = (indexOrFieldName as number) * elementItemLength;
      return [Math.floor(start / 32), start % 32, start % 32 + elementItemLength];
    case Type.container:
      return [
        type.fields.map(([fieldName]) => fieldName).indexOf(indexOrFieldName as string),
        0,
        itemLength(getElementType(type, indexOrFieldName)),
      ];
    default:
      throw new Error("unsupported type");
  }
}

function isListType(type: FullSSZType): boolean {
  return [
    Type.bitList,
    Type.byteList,
    Type.list
  ].includes(type.type);
}

/**
 * Converts a path (eg. `[7, "foo", 3]` for `x[7].foo[3]`, `[12, "bar", "__len__"]` for
 * `len(x[12].bar)`) into the generalized index representing its position in the Merkle tree.
 */
export function getGeneralizedIndex(type: FullSSZType, path: Path): GeneralizedIndex {
  let root = 1n;
  for (const p of path) {
    assert(!isBasicType(type));
    if (p === "__len__") {
      assert(isListType(type));
      return root * 2n + 1n;
    } else {
      const [pos] = getItemPosition(type, p);
      if (isListType(type)) {
        root *= 2n; // bit for length mix in
      }
      root *= BigInt(nextPowerOf2(chunkCount(type)) + pos);
      type = getElementType(type, p);
    }
  }
  return root;
}

// Generalized index helpers

/**
 * Given generalized indices i1 for A -> B, i2 for B -> C .... i_n for Y -> Z, returns
 * the generalized index for A -> Z.
 */
export function concatGeneralizedIndices(indices: GeneralizedIndex[]): GeneralizedIndex {
  let o = BigInt(1);
  for (const i of indices) {
    const pPowOf2 = BigInt(previousPowerOf2(Number(i)));
    o = o * pPowOf2 + (i - pPowOf2);
  }
  return o;
}



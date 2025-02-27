import * as program from "commander";

import { CipherView } from "jslib-common/models/view/cipherView";

import { ApiService } from "jslib-common/abstractions/api.service";
import { CipherService } from "jslib-common/abstractions/cipher.service";
import { CollectionService } from "jslib-common/abstractions/collection.service";
import { FolderService } from "jslib-common/abstractions/folder.service";
import { OrganizationService } from "jslib-common/abstractions/organization.service";
import { SearchService } from "jslib-common/abstractions/search.service";

import {
  CollectionDetailsResponse as ApiCollectionDetailsResponse,
  CollectionResponse as ApiCollectionResponse,
} from "jslib-common/models/response/collectionResponse";
import { ListResponse as ApiListResponse } from "jslib-common/models/response/listResponse";

import { CollectionData } from "jslib-common/models/data/collectionData";

import { Collection } from "jslib-common/models/domain/collection";

import { Response } from "jslib-node/cli/models/response";
import { ListResponse } from "jslib-node/cli/models/response/listResponse";

import { CipherResponse } from "../models/response/cipherResponse";
import { CollectionResponse } from "../models/response/collectionResponse";
import { FolderResponse } from "../models/response/folderResponse";
import { OrganizationResponse } from "../models/response/organizationResponse";
import { OrganizationUserResponse } from "../models/response/organizationUserResponse";

import { CliUtils } from "../utils";

import { Utils } from "jslib-common/misc/utils";

export class ListCommand {
  constructor(
    private cipherService: CipherService,
    private folderService: FolderService,
    private collectionService: CollectionService,
    private organizationService: OrganizationService,
    private searchService: SearchService,
    private apiService: ApiService
  ) {}

  async run(object: string, cmd: program.Command): Promise<Response> {
    switch (object.toLowerCase()) {
      case "items":
        return await this.listCiphers(cmd);
      case "folders":
        return await this.listFolders(cmd);
      case "collections":
        return await this.listCollections(cmd);
      case "org-collections":
        return await this.listOrganizationCollections(cmd);
      case "org-members":
        return await this.listOrganizationMembers(cmd);
      case "organizations":
        return await this.listOrganizations(cmd);
      default:
        return Response.badRequest("Unknown object.");
    }
  }

  private async listCiphers(options: program.OptionValues) {
    let ciphers: CipherView[];
    options.trash = options.trash || false;
    if (options.url != null && options.url.trim() !== "") {
      ciphers = await this.cipherService.getAllDecryptedForUrl(options.url);
    } else {
      ciphers = await this.cipherService.getAllDecrypted();
    }

    if (
      options.folderid != null ||
      options.collectionid != null ||
      options.organizationid != null
    ) {
      ciphers = ciphers.filter((c) => {
        if (options.trash !== c.isDeleted) {
          return false;
        }
        if (options.folderid != null) {
          if (options.folderid === "notnull" && c.folderId != null) {
            return true;
          }
          const folderId = options.folderid === "null" ? null : options.folderid;
          if (folderId === c.folderId) {
            return true;
          }
        }

        if (options.organizationid != null) {
          if (options.organizationid === "notnull" && c.organizationId != null) {
            return true;
          }
          const organizationId = options.organizationid === "null" ? null : options.organizationid;
          if (organizationId === c.organizationId) {
            return true;
          }
        }

        if (options.collectionid != null) {
          if (
            options.collectionid === "notnull" &&
            c.collectionIds != null &&
            c.collectionIds.length > 0
          ) {
            return true;
          }
          const collectionId = options.collectionid === "null" ? null : options.collectionid;
          if (collectionId == null && (c.collectionIds == null || c.collectionIds.length === 0)) {
            return true;
          }
          if (
            collectionId != null &&
            c.collectionIds != null &&
            c.collectionIds.indexOf(collectionId) > -1
          ) {
            return true;
          }
        }
        return false;
      });
    } else if (options.search == null || options.search.trim() === "") {
      ciphers = ciphers.filter((c) => options.trash === c.isDeleted);
    }

    if (options.search != null && options.search.trim() !== "") {
      ciphers = this.searchService.searchCiphersBasic(ciphers, options.search, options.trash);
    }

    const res = new ListResponse(ciphers.map((o) => new CipherResponse(o)));
    return Response.success(res);
  }

  private async listFolders(options: program.OptionValues) {
    let folders = await this.folderService.getAllDecrypted();

    if (options.search != null && options.search.trim() !== "") {
      folders = CliUtils.searchFolders(folders, options.search);
    }

    const res = new ListResponse(folders.map((o) => new FolderResponse(o)));
    return Response.success(res);
  }

  private async listCollections(options: program.OptionValues) {
    let collections = await this.collectionService.getAllDecrypted();

    if (options.organizationid != null) {
      collections = collections.filter((c) => {
        if (options.organizationid === c.organizationId) {
          return true;
        }
        return false;
      });
    }

    if (options.search != null && options.search.trim() !== "") {
      collections = CliUtils.searchCollections(collections, options.search);
    }

    const res = new ListResponse(collections.map((o) => new CollectionResponse(o)));
    return Response.success(res);
  }

  private async listOrganizationCollections(options: program.OptionValues) {
    if (options.organizationid == null || options.organizationid === "") {
      return Response.badRequest("--organizationid <organizationid> required.");
    }
    if (!Utils.isGuid(options.organizationid)) {
      return Response.error("`" + options.organizationid + "` is not a GUID.");
    }
    const organization = await this.organizationService.get(options.organizationid);
    if (organization == null) {
      return Response.error("Organization not found.");
    }

    try {
      let response: ApiListResponse<ApiCollectionResponse>;
      if (organization.canViewAllCollections) {
        response = await this.apiService.getCollections(options.organizationid);
      } else {
        response = await this.apiService.getUserCollections();
      }
      const collections = response.data
        .filter((c) => c.organizationId === options.organizationid)
        .map((r) => new Collection(new CollectionData(r as ApiCollectionDetailsResponse)));
      let decCollections = await this.collectionService.decryptMany(collections);
      if (options.search != null && options.search.trim() !== "") {
        decCollections = CliUtils.searchCollections(decCollections, options.search);
      }
      const res = new ListResponse(decCollections.map((o) => new CollectionResponse(o)));
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async listOrganizationMembers(options: program.OptionValues) {
    if (options.organizationid == null || options.organizationid === "") {
      return Response.badRequest("--organizationid <organizationid> required.");
    }
    if (!Utils.isGuid(options.organizationid)) {
      return Response.error("`" + options.organizationid + "` is not a GUID.");
    }
    const organization = await this.organizationService.get(options.organizationid);
    if (organization == null) {
      return Response.error("Organization not found.");
    }

    try {
      const response = await this.apiService.getOrganizationUsers(options.organizationid);
      const res = new ListResponse(
        response.data.map((r) => {
          const u = new OrganizationUserResponse();
          u.email = r.email;
          u.name = r.name;
          u.id = r.id;
          u.status = r.status;
          u.type = r.type;
          u.twoFactorEnabled = r.twoFactorEnabled;
          return u;
        })
      );
      return Response.success(res);
    } catch (e) {
      return Response.error(e);
    }
  }

  private async listOrganizations(options: program.OptionValues) {
    let organizations = await this.organizationService.getAll();

    if (options.search != null && options.search.trim() !== "") {
      organizations = CliUtils.searchOrganizations(organizations, options.search);
    }

    const res = new ListResponse(organizations.map((o) => new OrganizationResponse(o)));
    return Response.success(res);
  }
}

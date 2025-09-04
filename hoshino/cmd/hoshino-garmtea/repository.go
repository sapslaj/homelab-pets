package main

import (
	"context"
	"errors"
	"log/slog"

	garmclient "github.com/cloudbase/garm/client"
	"github.com/cloudbase/garm/client/pools"
	"github.com/cloudbase/garm/client/repositories"
	"github.com/cloudbase/garm/params"
	"github.com/go-openapi/runtime"

	"github.com/sapslaj/homelab-pets/hoshino/pkg/telemetry"
)

type Owner struct {
	ID    int    `json:"id"`
	Login string `json:"login"`
}

type Repository struct {
	ID    int    `json:"id"`
	Owner Owner  `json:"owner"`
	Name  string `json:"name"`
}

type PayloadRepository struct {
	Action     string     `json:"action"`
	Repository Repository `json:"repository"`
}

var (
	ErrRepositoryNotFound = errors.New("repository not found")
)

func SetupRepository(ctx context.Context, client *garmclient.GarmAPI, auth runtime.ClientAuthInfoWriter, repository Repository) HTTPError {
	logger := telemetry.LoggerFromContext(ctx)

	newRepo, err := client.Repositories.CreateRepo(&repositories.CreateRepoParams{
		Context: ctx,
		Body: params.CreateRepoParams{
			Owner:            repository.Owner.Login,
			Name:             repository.Name,
			CredentialsName:  "garm@git.sapslaj.cloud", // FIXME: don't hardcode this
			PoolBalancerType: params.PoolBalancerTypeRoundRobin,
		},
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "create repository failed", slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	_, err = client.Repositories.CreateRepoPool(&repositories.CreateRepoPoolParams{
		Context: ctx,
		RepoID:  newRepo.Payload.ID,
		Body: params.CreatePoolParams{
			ProviderName: "incus", // FIXME: don't hardcode these
			Image:        "ubuntu:24.04",
			Flavor:       "default",
			Tags:         []string{"default"},
			Enabled:      true,
		},
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "create repository pool failed", slog.String("repo_id", newRepo.Payload.ID), slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	_, err = client.Repositories.InstallRepoWebhook(&repositories.InstallRepoWebhookParams{
		Context: ctx,
		RepoID:  newRepo.Payload.ID,
		Body: params.InstallWebhookParams{
			WebhookEndpointType: params.WebhookEndpointDirect,
		},
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "installing webhook failed", slog.String("repo_id", newRepo.Payload.ID), slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	return HTTPOK
}

func DeleteRepository(ctx context.Context, client *garmclient.GarmAPI, auth runtime.ClientAuthInfoWriter, repository Repository) HTTPError {
	logger := telemetry.LoggerFromContext(ctx)

	listRepositories, err := client.Repositories.ListRepos(&repositories.ListReposParams{
		Context: ctx,
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "list repositories failed", slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	var repo *params.Repository
	for _, r := range listRepositories.Payload {
		if r.Name == repository.Name && r.Owner == repository.Owner.Login {
			repo = &r
		}
	}
	if repo == nil {
		logger.WarnContext(
			ctx,
			"repository not found",
			slog.String("repo_name", repository.Name),
			slog.String("repo_owner", repository.Owner.Login),
		)

		return HTTPError{
			Code:  404,
			Inner: ErrRepositoryNotFound,
		}
	}

	repoPools, err := client.Repositories.ListRepoPools(&repositories.ListRepoPoolsParams{
		Context: ctx,
		RepoID:  repo.ID,
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "list repo pools failed", slog.String("repo_id", repo.ID), slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	for _, pool := range repoPools.Payload {
		err := client.Pools.DeletePool(&pools.DeletePoolParams{
			Context: ctx,
			PoolID:  pool.ID,
		}, auth)
		if err != nil {
			logger.ErrorContext(ctx, "delete repo pool failed", slog.String("repo_id", repo.ID), slog.String("pool_id", pool.ID), slog.Any("error", err))
			return HTTPError{
				Inner: err,
			}
		}
	}

	err = client.Repositories.DeleteRepo(&repositories.DeleteRepoParams{
		Context: ctx,
		RepoID:  repo.ID,
	}, auth)
	if err != nil {
		logger.ErrorContext(ctx, "delete repo failed", slog.String("repo_id", repo.ID), slog.Any("error", err))
		return HTTPError{
			Inner: err,
		}
	}

	return HTTPOK
}

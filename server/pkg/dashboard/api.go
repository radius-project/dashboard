// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------

package dashboard

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/project-radius/radius/pkg/armrpc/rest"
	"github.com/project-radius/radius/pkg/azure/tokencredentials"
	"github.com/project-radius/radius/pkg/cli/clients_new/generated"
	ucpv20220901 "github.com/project-radius/radius/pkg/ucp/api/v20220901privatepreview"
	ucpresources "github.com/project-radius/radius/pkg/ucp/resources"

	k8srest "k8s.io/client-go/rest"
)

type API struct {
	RestConfig *k8srest.Config
}

func (api *API) ResourceGroupClient() (*ucpv20220901.ResourceGroupsClient, error) {
	return ucpv20220901.NewResourceGroupsClient(&tokencredentials.AnonymousCredential{}, nil)
}

func (api *API) ClientFor(rootScope string, resourceType string) (*generated.GenericResourcesClient, error) {
	return generated.NewGenericResourcesClient(rootScope, resourceType, &tokencredentials.AnonymousCredential{}, nil)
}

var resourceTypes = []string{
	"Applications.Core/applications",
	"Applications.Core/environments",
	"Applications.Core/gateways",
	"Applications.Core/httpRoutes",
	"Applications.Core/containers",
	"Applications.Link/extenders",
	"Applications.Link/mongoDatabases",
	"Applications.Link/rabbitMQMessageQueues",
	"Applications.Link/redisCaches",
	"Applications.Link/sqlDatabases",
	"Applications.Link/daprStateStores",
	"Applications.Link/daprSecretStores",
	"Applications.Link/daprPubSubBrokers",
	"Applications.Link/daprInvokeHttpRoutes",
}

func (api *API) ListResourcesAtPlaneScope(req *http.Request) (rest.Response, error) {
	resourceType := req.URL.Query().Get("resourceType")

	searchTypes := []string{resourceType}
	if resourceType == "" {
		searchTypes = resourceTypes
	}

	// We need to polyfill the "environment field" where it's not present.
	applicationCache := map[string]generated.GenericResource{}

	all := []generated.GenericResource{}
	for _, resourceType := range searchTypes {
		resources, err := api.listResourceAtPlaneScope(req.Context(), applicationCache, resourceType)
		if err != nil {
			return handleResponseError(err)
		}

		for _, resource := range resources {
			c := resource
			all = append(all, c)
		}
	}

	body := map[string]interface{}{
		"values": all,
	}

	return rest.NewOKResponse(body), nil
}

func (api *API) listResourceAtPlaneScope(ctx context.Context, applicationCache map[string]generated.GenericResource, resourceType string) ([]generated.GenericResource, error) {
	groupClient, err := api.ResourceGroupClient()
	if err != nil {
		return nil, err
	}

	groups, err := groupClient.List(ctx, "radius", "local", nil)
	if err != nil {
		return nil, err
	}
	resources := []generated.GenericResource{}

	for _, group := range groups.Value {
		c := *group

		client, err := api.ClientFor(*c.ID, resourceType)
		if err != nil {
			return nil, err
		}

		pager := client.NewListByRootScopePager(nil)
		for pager.More() {
			page, err := pager.NextPage(ctx)
			if err != nil {
				return nil, err
			}

			for _, item := range page.Value {
				c := *item

				// The UI really wants to see the environment and application but not all
				// of our resources will return both.
				//
				// The following is an embarassing hack.
				_, hasEnvironment := c.Properties["environment"]
				_, hasApplication := c.Properties["application"]
				if hasApplication && !hasEnvironment {
					key := strings.ToLower(c.Properties["application"].(string))

					application, found := applicationCache[key]
					if !found {
						// Cache miss!
						id, err := ucpresources.ParseResource(key)
						if err != nil {
							return nil, err
						}

						applicationClient, err := api.ClientFor(id.RootScope(), "Applications.Core/applications")
						if err != nil {
							return nil, err
						}

						response, err := applicationClient.Get(ctx, id.Name(), nil)
						applicationCache[key] = response.GenericResource
						application = response.GenericResource
					}

					environment := application.Properties["environment"].(string)
					c.Properties["environment"] = environment
				}

				resources = append(resources, c)
			}
		}
	}

	return resources, nil
}

func handleResponseError(err error) (rest.Response, error) {
	responseError := &azcore.ResponseError{}
	if errors.As(err, &responseError) {
		return &ErrorResponse{Err: responseError}, nil
	}

	return nil, err
}

var _ rest.Response = (*ErrorResponse)(nil)

type ErrorResponse struct {
	Err *azcore.ResponseError
}

func (r *ErrorResponse) Apply(ctx context.Context, w http.ResponseWriter, req *http.Request) error {
	bb, err := io.ReadAll(r.Err.RawResponse.Body)
	defer r.Err.RawResponse.Body.Close()
	if err != nil {
		return err
	}

	w.WriteHeader(r.Err.StatusCode)
	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(bb)
	if err != nil {
		return err
	}

	return nil
}
